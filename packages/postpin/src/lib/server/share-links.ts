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
 * Id of the project's guest category. It is created with the project, so this only creates
 * one for projects that lack it.
 * createdById stays null: nobody owns it, so moveMarker's cleanup
 * (deletes only the user's own empty categories) never removes it.
 */
export async function ensureGuestCategory(tx: Tx, projectId: string): Promise<string> {
	// Lock the project row: two links created at once must not create two categories
	await tx.$queryRaw`SELECT 1 FROM "project" WHERE "id" = ${projectId} FOR UPDATE`;

	const project = await tx.project.findUniqueOrThrow({
		where: { id: projectId },
		select: { guestCategoryId: true },
	});
	if (project.guestCategoryId) return project.guestCategoryId;

	const taken = new Set(
		(
			await tx.category.findMany({
				where: { projectId, name: { startsWith: GUEST_CATEGORY_NAME } },
				select: { name: true },
			})
		).map((c) => c.name),
	);
	let name = GUEST_CATEGORY_NAME;
	for (let i = 2; taken.has(name); i++) name = `${GUEST_CATEGORY_NAME} (${i})`;

	const category = await tx.category.create({
		data: { name, color: GUEST_CATEGORY_COLOR, projectId, createdById: null },
	});
	await tx.project.update({ where: { id: projectId }, data: { guestCategoryId: category.id } });
	return category.id;
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

export async function isGuestCategory(categoryId: string, db: Tx | typeof prisma = prisma) {
	return (await db.project.count({ where: { guestCategoryId: categoryId } })) > 0;
}
