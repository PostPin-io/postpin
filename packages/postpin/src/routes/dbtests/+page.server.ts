import { prisma } from "#lib/server/database.ts";

export const load = async () => {
	const users = await prisma.user.findMany({
		orderBy: { name: "desc" },
		where: { name: { contains: "h" } },
	});
	return {
		users,
	};
};
