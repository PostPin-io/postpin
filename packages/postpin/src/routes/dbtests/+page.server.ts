import { prisma } from "#lib/server/database.ts";
import { s3Client } from "#lib/server/storage.ts";

export const load = async () => {
	console.log(await s3Client.listBuckets());
	await prisma.user.create({
		data: {
			name: "hans",
		},
	});
	const users = await prisma.user.findMany({
		orderBy: { name: "desc" },
		where: { name: { contains: "h" } },
	});
	return {
		users,
	};
};
