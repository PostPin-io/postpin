import { randomUUID } from "node:crypto";
import { Role } from "@postpin-io/shared/db/enums";
import { prisma } from "./db.ts";

/**
 * Builders for test data. Each one creates exactly one row (plus required
 * parents when they are not passed in) and returns it.
 */

let n = 0;
const next = () => ++n;

export async function createUser(data: { name?: string; email?: string } = {}) {
	const i = next();
	return prisma.user.create({
		data: { name: data.name ?? `User ${i}`, email: data.email ?? `user${i}@test.local` },
	});
}

export async function createOrg(data: { name?: string } = {}) {
	const i = next();
	return prisma.organization.create({
		data: {
			id: randomUUID(),
			name: data.name ?? `Org ${i}`,
			slug: `org-${i}-${randomUUID()}`,
			createdAt: new Date(),
		},
	});
}

export async function createMember(org: { id: string }, role: Role, user?: { id: string }) {
	const u = user ?? (await createUser());
	const member = await prisma.member.create({
		data: { organizationId: org.id, userId: u.id, role },
	});
	const fullUser = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
	return { ...member, user: fullUser };
}

export async function createProject(
	org: { id: string },
	data: { creator?: { id: string }; name?: string } = {},
) {
	return prisma.project.create({
		data: {
			name: data.name ?? `Project ${next()}`,
			organizationId: org.id,
			creatorId: data.creator?.id ?? null,
		},
	});
}

export async function createTimeline(project: { id: string }, data: { name?: string } = {}) {
	return prisma.timeline.create({
		data: { name: data.name ?? `Timeline ${next()}`, projectId: project.id },
	});
}

export async function createExport(
	timeline: { id: string },
	data: {
		name?: string;
		media?: boolean;
		/** Only the parts of a timeline snapshot the tests need, e.g. the frame range */
		snapshot?: { startFrameIndex: number; durationFrameCount: number };
	} = {},
) {
	let mediaId: string | null = null;
	if (data.media) {
		const original = await prisma.mediaFile.create({ data: {} });
		mediaId = (await prisma.media.create({ data: { originalId: original.id } })).id;
	}
	return prisma.export.create({
		data: {
			name: data.name ?? `Export ${next()}`,
			timelineId: timeline.id,
			mediaId,
			...(data.snapshot && { timelineSnapshot: data.snapshot }),
		},
	});
}

export async function createCategory(
	project: { id: string },
	data: { createdBy?: { id: string } } = {},
) {
	return prisma.category.create({
		data: {
			name: `Category ${next()}`,
			color: "#ff0000",
			projectId: project.id,
			createdById: data.createdBy?.id ?? null,
		},
	});
}

export async function createMarker(
	exp: { id: string },
	category: { id: string },
	data: { author?: { id: string }; guest?: { id: string }; frame?: number; duration?: number } = {},
) {
	return prisma.marker.create({
		data: {
			name: `Marker ${next()}`,
			frame: data.frame ?? 0,
			duration: data.duration ?? 0,
			exportId: exp.id,
			categoryId: category.id,
			authorId: data.author?.id ?? null,
			guestId: data.guest?.id ?? null,
		},
	});
}

export async function createShareLink(
	exp: { id: string },
	data: { creator?: { id: string }; expiresAt?: Date; revokedAt?: Date } = {},
) {
	return prisma.shareLink.create({
		data: {
			exportId: exp.id,
			creatorId: data.creator?.id ?? null,
			token: `share-token-${next()}-${randomUUID()}`,
			expiresAt: data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			revokedAt: data.revokedAt ?? null,
		},
	});
}

export async function createShareGuest(link: { id: string }, data: { name?: string } = {}) {
	const i = next();
	return prisma.shareGuest.create({
		data: {
			shareLinkId: link.id,
			name: data.name ?? `Guest ${i}`,
			sessionTokenHash: `hash-${i}-${randomUUID()}`,
		},
	});
}

type GrantTarget = { projectId: string } | { timelineId: string };

export async function grant(
	member: { id: string },
	target: GrantTarget,
	createdBy?: { id: string },
) {
	return prisma.memberGrant.create({
		data: { memberId: member.id, ...target, createdById: createdBy?.id ?? null },
	});
}

export async function createInvitation(
	org: { id: string },
	data: {
		role?: Role;
		/** Default: a fresh user. `null` = the inviter's account was deleted. */
		inviter?: { id: string } | null;
		email?: string;
	} & Partial<GrantTarget> = {},
) {
	const inviter = data.inviter === undefined ? await createUser() : data.inviter;
	return prisma.invitation.create({
		data: {
			organizationId: org.id,
			email: data.email ?? `invitee${next()}@test.local`,
			role: data.role ?? Role.MEMBER,
			expiresAt: new Date(Date.now() + 86_400_000),
			inviterId: inviter?.id ?? null,
			projectId: "projectId" in data ? data.projectId : null,
			timelineId: "timelineId" in data ? data.timelineId : null,
		},
	});
}

export async function createInviteLink(
	org: { id: string },
	data: {
		role?: Role;
		/** Default: a fresh user. `null` = the creator's account was deleted. */
		createdBy?: { id: string } | null;
	} & Partial<GrantTarget> = {},
) {
	const createdBy = data.createdBy === undefined ? await createUser() : data.createdBy;
	return prisma.inviteLink.create({
		data: {
			organizationId: org.id,
			role: data.role ?? Role.MEMBER,
			token: randomUUID(),
			createdById: createdBy?.id ?? null,
			projectId: "projectId" in data ? data.projectId : null,
			timelineId: "timelineId" in data ? data.timelineId : null,
		},
	});
}
