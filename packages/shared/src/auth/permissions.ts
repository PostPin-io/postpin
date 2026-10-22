import type { User, PrismaClient } from "../db/index.ts";

export async function hasMediaAccess(prisma: PrismaClient, user: User, mediaId: string) {
	return await prisma.media
		.findFirstOrThrow({
			select: { id: true },
			where: {
				id: mediaId,
				export: {
					timeline: {
						project: {
							organization: {
								members: {
									some: {
										userId: user.id,
									},
								},
							},
						},
					},
				},
			},
		})
		.then(() => true)
		.catch(() => false);
}
