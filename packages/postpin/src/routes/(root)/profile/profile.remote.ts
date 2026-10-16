import { prisma } from "#lib/server/database.ts";
import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";

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
