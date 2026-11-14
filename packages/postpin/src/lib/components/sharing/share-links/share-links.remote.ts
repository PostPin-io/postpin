import { error } from "@sveltejs/kit";
import { command, query } from "$app/server";
import * as v from "valibot";
import { BETTER_AUTH_URL, SCREENING_MAX_GUESTS } from "$app/env/private";
import {
	MAX_RECIPIENTS_PER_DAY,
	SCREENING_DEFAULT_MAX_GUESTS,
	SCREENING_PRESET,
	expiresAtFor,
	shareLinkMailContent,
	shareLinkNote,
	shareLinkPath,
	shareLinkPreset,
	shareLinkRecipients,
	shareLinkStatus,
	timeZone,
} from "@postpin-io/shared/logic/share-links";
import { sendEmail } from "#lib/server/email.ts";
import { recipientsSentToday } from "#lib/server/share-link-mails.ts";

import { prisma } from "#lib/server/database.ts";
import { accessChecker, authorize } from "#lib/server/org-access.ts";
import {
	createScreeningCategory,
	ensureGuestCategory,
	newShareToken,
} from "#lib/server/share-links.ts";

export const getShareLinks = query(v.string(), async (exportId: string) => {
	const { member, target } = await authorize("shareLink", "read", { type: "export", id: exportId });
	const allowed = await accessChecker(member);

	const links = await prisma.shareLink.findMany({
		where: { exportId },
		orderBy: { createdAt: "desc" },
		include: {
			creator: { select: { id: true, name: true } },
			// screenings: where their guests' markers go
			category: { select: { name: true } },
			_count: { select: { guests: true } },
		},
	});

	return links.map((link) => {
		const t = {
			projectId: target.projectId,
			timelineId: target.timelineId,
			ownerId: link.creatorId,
		};
		const status = shareLinkStatus(link);
		return {
			...link,
			status,
			canUpdate: status !== "revoked" && allowed("shareLink", "update", t),
			canRevoke: status !== "revoked" && allowed("shareLink", "delete", t),
			/** Open the presentation window for this screening link: whoever may edit it */
			canScreen:
				link.kind === "SCREENING" && status === "active" && allowed("shareLink", "update", t),
			guestCount: link._count.guests,
			// where the export view lives, for starting a screening from the list
			projectId: target.projectId!,
			timelineId: target.timelineId!,
		};
	});
});

export const createShareLink = command(
	v.object({
		exportId: v.string(),
		preset: shareLinkPreset,
		timelinePanelVisible: v.optional(v.boolean(), false),
		markerPanelVisible: v.optional(v.boolean(), true),
		note: v.optional(shareLinkNote),
	}),
	async (data) => {
		const { user, target } = await authorize("shareLink", "create", {
			type: "export",
			id: data.exportId,
		});

		const link = await prisma.$transaction(async (tx) => {
			await ensureGuestCategory(tx, target.projectId!);
			return tx.shareLink.create({
				data: {
					exportId: data.exportId,
					creatorId: user.id,
					token: newShareToken(),
					expiresAt: expiresAtFor(data.preset),
					timelinePanelVisible: data.timelinePanelVisible,
					markerPanelVisible: data.markerPanelVisible,
					note: data.note ?? null,
				},
			});
		});

		await getShareLinks(data.exportId).refresh();
		return { id: link.id, token: link.token };
	},
);

// ─── Screenings ─────────────────────────────────────────────────────────────

const screeningGuestLimit = v.pipe(v.number(), v.integer(), v.minValue(1));

function assertGuestLimit(maxGuests: number) {
	if (maxGuests > SCREENING_MAX_GUESTS) {
		error(400, `A screening can have at most ${SCREENING_MAX_GUESTS} guests`);
	}
}

/** What the "start screening" dialog shows before anything is created */
export const getScreeningSetup = query(v.string(), async (exportId) => {
	const { member, target } = await authorize("shareLink", "create", {
		type: "export",
		id: exportId,
	});
	const allowed = await accessChecker(member);
	const links = await prisma.shareLink.findMany({
		where: { exportId, kind: "SCREENING", revokedAt: null, expiresAt: { gt: new Date() } },
		orderBy: { createdAt: "desc" },
		include: { _count: { select: { guests: true } }, category: { select: { name: true } } },
	});
	// The newest active screening link this member may run; the dialog offers to continue it
	const existing = links.find((link) =>
		allowed("shareLink", "update", { ...target, ownerId: link.creatorId }),
	);
	return {
		maxGuestsLimit: SCREENING_MAX_GUESTS,
		defaultMaxGuests: Math.min(SCREENING_DEFAULT_MAX_GUESTS, SCREENING_MAX_GUESTS),
		existing: existing
			? {
					id: existing.id,
					createdAt: existing.createdAt,
					maxGuests: existing.maxGuests,
					guestCount: existing._count.guests,
					expiresAt: existing.expiresAt,
					categoryName: existing.category?.name ?? null,
				}
			: null,
	};
});

/**
 * A new screening: its own link (marker panel only, 24 hours, no note, a guest limit) and
 * its own category for the guests' markers, named after the day ("Screening (14/11/2026)").
 */
export const createScreeningLink = command(
	v.object({
		exportId: v.string(),
		maxGuests: screeningGuestLimit,
		/** The presenter's, for the date in the category name */
		timeZone,
	}),
	async ({ exportId, maxGuests, timeZone }) => {
		const { user, target } = await authorize("shareLink", "create", {
			type: "export",
			id: exportId,
		});
		assertGuestLimit(maxGuests);

		const link = await prisma.$transaction(async (tx) => {
			// the fallback once the screening category is deleted
			await ensureGuestCategory(tx, target.projectId!);
			const category = await createScreeningCategory(tx, target.projectId!, user.id, timeZone);
			return tx.shareLink.create({
				data: {
					exportId,
					creatorId: user.id,
					token: newShareToken(),
					kind: "SCREENING",
					expiresAt: expiresAtFor(SCREENING_PRESET),
					timelinePanelVisible: false,
					markerPanelVisible: true,
					maxGuests,
					categoryId: category.id,
				},
			});
		});

		await Promise.all([getShareLinks(exportId).refresh(), getScreeningSetup(exportId).refresh()]);
		return { id: link.id, token: link.token };
	},
);

/**
 * Runs the screening of an existing screening link again: same link, same category. With
 * `maxGuests` the limit changes too, never below the guests already in.
 */
export const resumeScreeningLink = command(
	v.object({ id: v.string(), maxGuests: v.optional(screeningGuestLimit) }),
	async ({ id, maxGuests }) => {
		await authorize("shareLink", "update", { type: "shareLink", id });
		if (maxGuests !== undefined) assertGuestLimit(maxGuests);

		const link = await prisma.shareLink.findUniqueOrThrow({
			where: { id },
			include: { _count: { select: { guests: true } } },
		});
		if (link.kind !== "SCREENING") error(400, "Not a screening link");
		if (shareLinkStatus(link) !== "active") error(409, "This link is no longer active");

		if (maxGuests !== undefined) {
			await prisma.shareLink.update({
				where: { id },
				data: { maxGuests: Math.max(maxGuests, link._count.guests) },
			});
			await Promise.all([
				getShareLinks(link.exportId).refresh(),
				getScreeningSetup(link.exportId).refresh(),
			]);
		}
		return { id: link.id, token: link.token };
	},
);

/** Only the fields given change. A new preset counts from now, so an expired link can be renewed. */
export const updateShareLink = command(
	v.object({
		id: v.string(),
		preset: v.optional(shareLinkPreset),
		timelinePanelVisible: v.optional(v.boolean()),
		markerPanelVisible: v.optional(v.boolean()),
		note: v.optional(v.nullable(shareLinkNote)),
	}),
	async ({ id, preset, note, ...panels }) => {
		await authorize("shareLink", "update", { type: "shareLink", id });

		const { exportId } = await prisma.shareLink.findUniqueOrThrow({
			where: { id },
			select: { exportId: true },
		});
		// revokedAt: null in the WHERE, so a revoke in between can't be undone
		const { count } = await prisma.shareLink.updateMany({
			where: { id, revokedAt: null },
			data: {
				...panels,
				...(note !== undefined && { note }),
				...(preset && { expiresAt: expiresAtFor(preset) }),
			},
		});
		if (count === 0) error(409, "Link was revoked");

		await getShareLinks(exportId).refresh();
	},
);

/** Final: a revoked link can't be renewed. Revoking twice keeps the first time. */
export const revokeShareLink = command(v.object({ id: v.string() }), async ({ id }) => {
	await authorize("shareLink", "delete", { type: "shareLink", id });

	const { exportId } = await prisma.shareLink.findUniqueOrThrow({
		where: { id },
		select: { exportId: true },
	});
	await prisma.shareLink.updateMany({
		where: { id, revokedAt: null },
		data: { revokedAt: new Date() },
	});

	await getShareLinks(exportId).refresh();
});
/**
 * Mails the link to free-text addresses: one mail per recipient (nobody sees the others),
 * replies go to the sender. Whoever may create share links on the export may send them.
 */
export const sendShareLink = command(
	v.object({ id: v.string(), emails: shareLinkRecipients }),
	async ({ id, emails }) => {
		const link = await prisma.shareLink.findUnique({
			where: { id },
			include: { export: { select: { name: true } } },
		});
		if (!link) error(404, "Not found");
		const { user } = await authorize("shareLink", "create", {
			type: "export",
			id: link.exportId,
		});
		if (shareLinkStatus(link) !== "active") error(409, "This link is no longer active");

		// Two sends at the same moment can both pass this check; good enough against misuse
		const sentToday = await recipientsSentToday(link.id, user.id);
		if (sentToday + emails.length > MAX_RECIPIENTS_PER_DAY) {
			const left = Math.max(0, MAX_RECIPIENTS_PER_DAY - sentToday);
			error(
				429,
				`You can send this link to at most ${MAX_RECIPIENTS_PER_DAY} people a day (${left} left today).`,
			);
		}

		// Logged before sending: a failing mail server must not reset the limit
		await prisma.shareLinkMail.create({
			data: { shareLinkId: link.id, senderId: user.id, recipients: emails },
		});

		const { subject, text } = shareLinkMailContent({
			senderName: user.name,
			exportName: link.export.name,
			url: BETTER_AUTH_URL + shareLinkPath(link.token),
			note: link.note,
			expiresAt: link.expiresAt,
		});
		const results = await Promise.allSettled(
			emails.map((to) => sendEmail(to, subject, text, { replyTo: user.email })),
		);
		const failed = emails.filter((_, i) => results[i]!.status === "rejected");
		if (failed.length === emails.length) {
			error(502, "The e-mails could not be sent. Please try again later.");
		}
		return { sent: emails.length - failed.length, failed };
	},
);
