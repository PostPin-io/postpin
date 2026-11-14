import { randomBytes } from "node:crypto";
import { error } from "@sveltejs/kit";
import type { Prisma } from "@postpin-io/shared/db";
import {
	screeningCategoryName,
	screeningDate,
	shareLinkStatus,
} from "@postpin-io/shared/logic/share-links";
import { prisma } from "#lib/server/database.ts";

type Tx = Prisma.TransactionClient;

export const GUEST_CATEGORY_NAME = "Guest";
export const GUEST_CATEGORY_COLOR = "#8b5cf6";
export const SCREENING_CATEGORY_COLOR = "#f59e0b";

/** 256 bit, URL-safe */
export const newShareToken = () => randomBytes(32).toString("base64url");

/**
 * The link behind a public token, with what the share view needs.
 * 404: no such link. 410: expired or revoked. Called on every request,
 * so revoking or expiry ends running sessions immediately.
 */
export async function resolveShareLink(token: string) {
	const link = await prisma.shareLink.findUnique({
		where: { token },
		include: {
			export: {
				select: {
					id: true,
					name: true,
					mediaId: true,
					timeline: { select: { projectId: true } },
				},
			},
		},
	});
	if (!link) error(404, "Link not found");
	if (shareLinkStatus(link) !== "active") error(410, "Link is no longer active");
	return link;
}

/**
 * Id of the category for the markers of guests of standard links: the project's category named
 * "Guest", created when there is none. An ordinary category: the team can use, rename and
 * delete it (a renamed one is no longer found here, so the next link gets a new "Guest").
 */
export async function guestCategoryFor(
	tx: Tx,
	projectId: string,
	creatorId: string | null,
): Promise<string> {
	// Lock the project row: two links created at once must not both create the category
	await tx.$queryRaw`SELECT 1 FROM "project" WHERE "id" = ${projectId} FOR UPDATE`;
	const where = { projectId_name: { projectId, name: GUEST_CATEGORY_NAME } };
	const category =
		(await tx.category.findUnique({ where, select: { id: true } })) ??
		(await tx.category.create({
			data: {
				name: GUEST_CATEGORY_NAME,
				color: GUEST_CATEGORY_COLOR,
				projectId,
				createdById: creatorId,
			},
			select: { id: true },
		}));
	return category.id;
}

/**
 * The category a guest's new marker gets: the link's, or "Guest" once that one was deleted
 * (the link keeps it from then on).
 */
export async function shareLinkCategory(
	tx: Tx,
	link: { id: string; categoryId: string | null; creatorId: string | null },
	projectId: string,
): Promise<string> {
	if (link.categoryId) return link.categoryId;
	const categoryId = await guestCategoryFor(tx, projectId, link.creatorId);
	// updateMany: a link deleted meanwhile is no error here, the marker's own checks decide
	await tx.shareLink.updateMany({ where: { id: link.id }, data: { categoryId } });
	return categoryId;
}

/**
 * The category for the markers of one screening's guests, named after its day in the
 * presenter's time zone. An ordinary category otherwise: the presenter owns it, the team can
 * use, rename and delete it.
 */
export async function createScreeningCategory(
	tx: Tx,
	projectId: string,
	creatorId: string,
	timeZone: string,
) {
	// Lock the project row: two screenings started at once must not get the same number
	await tx.$queryRaw`SELECT 1 FROM "project" WHERE "id" = ${projectId} FOR UPDATE`;
	const taken = await tx.category.findMany({
		where: { projectId, name: { startsWith: "Screening" } },
		select: { name: true },
	});
	const name = screeningCategoryName(
		screeningDate(new Date(), timeZone),
		taken.map((c) => c.name),
	);
	return tx.category.create({
		data: { name, color: SCREENING_CATEGORY_COLOR, projectId, createdById: creatorId },
	});
}
