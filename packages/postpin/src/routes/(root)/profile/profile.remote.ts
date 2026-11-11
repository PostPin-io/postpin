import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";
import { canLeave, roleAllows } from "#lib/roles.ts";
import { requireOrgRole } from "#lib/server/org-access.ts";
import { Role } from "@postpin-io/shared/db";
import { revokeInvitesOf } from "#lib/server/invite-links.ts";
import {
	getOrgUsage,
	orgQuota,
	storageUsageRows,
	sumBy,
	totalUsed,
	userQuota,
} from "#lib/server/storage-usage.ts";

export const getProfile = query(async () => {
	const id = getRequestEvent().locals.user?.id;
	if (!id) error(401, "Not signed in");
	const user = await prisma.user.findUnique({
		where: { id },
		select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
	});
	if (!user) error(404, "User not found");
	return user;
});

export const getMemberships = query(async () => {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");

	const memberships = await prisma.member.findMany({
		where: { userId: user.id },
		include: { organization: { select: { id: true, name: true, slug: true } } },
		orderBy: { organization: { name: "asc" } },
	});

	return memberships.map((m) => ({ role: m.role, ...m.organization }));
});

/**
 * Storage of the exports this user uploaded, across all organizations, and how much they can still
 * upload to each organization they may upload to: the user's and the org's quota both apply.
 */
export const getMyStorage = query(async () => {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");

	const [rows, me, memberships] = await Promise.all([
		storageUsageRows({ userId: user.id }),
		prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { storageQuota: true } }),
		prisma.member.findMany({
			where: { userId: user.id },
			select: {
				role: true,
				organization: { select: { id: true, name: true, storageQuota: true } },
			},
			orderBy: { organization: { name: "asc" } },
		}),
	]);
	const used = totalUsed(rows);
	const quota = userQuota(me.storageQuota);
	const userLeft = quota === null ? null : max0(quota - used);
	const byOrg = sumBy(rows, "orgId");

	const organizations = await Promise.all(
		memberships
			.filter((m) => roleAllows(m.role, "export", "upload"))
			.map(async ({ organization: org }) => {
				const orgQuotaBytes = orgQuota(org.storageQuota);
				const orgLeft =
					orgQuotaBytes === null ? null : max0(orgQuotaBytes - (await getOrgUsage(org.id)));
				return {
					id: org.id,
					name: org.name,
					used: byOrg.get(org.id) ?? 0n,
					// null = unlimited
					left: minQuota(userLeft, orgLeft),
					limitedBy:
						orgLeft !== null && (userLeft === null || orgLeft < userLeft)
							? ("organization" as const)
							: userLeft !== null
								? ("user" as const)
								: null,
				};
			}),
	);
	return { used, quota, organizations };
});

const max0 = (n: bigint) => (n > 0n ? n : 0n);
/** The smaller of two limits, where null is unlimited */
const minQuota = (a: bigint | null, b: bigint | null) =>
	a === null ? b : b === null ? a : a < b ? a : b;

// rough "Browser on OS" label; good enough to tell sessions apart
function describeUserAgent(userAgent: string | null) {
	if (!userAgent) return "Unknown device";
	const browser =
		[
			["Edge", /Edg\//],
			["Opera", /OPR\//],
			["Firefox", /Firefox\//],
			["Chrome", /Chrome\//],
			["Safari", /Safari\//],
		].find(([, re]) => (re as RegExp).test(userAgent))?.[0] ?? "Unknown browser";
	const os =
		[
			["iOS", /iPhone|iPad/],
			["Android", /Android/],
			["macOS", /Mac OS X/],
			["Windows", /Windows/],
			["Linux", /Linux/],
		].find(([, re]) => (re as RegExp).test(userAgent))?.[0] ?? null;
	return os ? `${browser} on ${os}` : browser;
}

export const getSessions = query(async () => {
	const { user, session: current } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");

	const sessions = await prisma.session.findMany({
		where: { userId: user.id, expiresAt: { gt: new Date() } },
		select: {
			id: true,
			userAgent: true,
			ipAddress: true,
			clientId: true,
			deviceName: true,
			createdAt: true,
			updatedAt: true,
		},
		orderBy: { updatedAt: "desc" },
	});

	return sessions.map((s) => ({
		id: s.id,
		app: s.clientId ? (DEVICE_CLIENTS[s.clientId] ?? s.clientId) : describeUserAgent(s.userAgent),
		deviceName: s.deviceName,
		ipAddress: s.ipAddress || null,
		createdAt: s.createdAt,
		lastActive: s.updatedAt,
		current: s.id === current?.id,
	}));
});

export const revokeSession = command(v.string(), async (id) => {
	const { user, session: current } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	if (id === current?.id) error(400, "Use sign out to end the current session");

	await prisma.session.deleteMany({ where: { id, userId: user.id } });
	await getSessions().refresh();
});

/** hooks.server.ts moves the active organization elsewhere on the next request. */
export const leaveOrganization = command(v.string(), async (organizationId) => {
	const me = await requireOrgRole(organizationId, Role.REVIEWER);

	// Serializable: two owners leaving at once must not leave the org without an owner
	await prisma.$transaction(
		async (tx) => {
			const ownerCount = await tx.member.count({ where: { organizationId, role: Role.OWNER } });
			if (!canLeave(me.role, ownerCount)) {
				error(400, "The last owner can't leave. Make someone else owner first.");
			}
			await tx.member.delete({ where: { id: me.id } }); // grants cascade
			await revokeInvitesOf(tx, me, null);
		},
		{ isolationLevel: "Serializable" },
	);
});
