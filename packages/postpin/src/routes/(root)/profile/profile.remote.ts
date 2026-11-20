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
import { soleOwnerOrgs } from "#lib/server/account-deletion.ts";
import { signInProviders } from "#lib/server/auth-providers.ts";
import { DELETE_WITHOUT_PASSWORD_MAX_AGE_MS } from "#lib/server/auth.ts";

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

/** How this user can sign in: password, 2FA, passkeys, linked SSO/social accounts */
export const getSignInMethods = query(async () => {
	const { user, session } = getRequestEvent().locals;
	if (!user || !session) error(401, "Not signed in");

	const [me, accounts, passkeys, current] = await Promise.all([
		prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorEnabled: true } }),
		prisma.account.findMany({
			where: { userId: user.id },
			select: { id: true, providerId: true, createdAt: true },
			orderBy: { createdAt: "asc" },
		}),
		prisma.passkey.findMany({
			where: { userId: user.id },
			select: { id: true, name: true, createdAt: true, backedUp: true },
			orderBy: { createdAt: "asc" },
		}),
		prisma.session.findUniqueOrThrow({
			where: { id: session.id },
			select: { createdAt: true, clientId: true },
		}),
	]);

	const linked = accounts.filter((a) => a.providerId !== "credential");
	return {
		hasPassword: accounts.length > linked.length,
		twoFactorEnabled: !!me.twoFactorEnabled,
		passkeys,
		// the configured providers, and whether this user has linked each
		providers: signInProviders().map((p) => {
			// better-auth unlinks by its own account id
			const accountId = linked.find((a) => a.providerId === p.id)?.id ?? null;
			return { ...p, accountId, linked: accountId !== null };
		}),
		// accounts without a password can delete themselves only right after signing in (auth.ts)
		recentSignIn:
			!current.clientId &&
			Date.now() - current.createdAt.getTime() < DELETE_WITHOUT_PASSWORD_MAX_AGE_MS,
	};
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

export const getDeletionBlockers = query(async () => {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	return soleOwnerOrgs(user.id);
});
