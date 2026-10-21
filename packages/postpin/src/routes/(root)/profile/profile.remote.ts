import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { command, getRequestEvent, query } from "$app/server";
import * as v from "valibot";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";

export const getProfile = query(async () => {
	const user = await prisma.user.findUnique({
		where: { id: getRequestEvent().locals.user?.id },
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
