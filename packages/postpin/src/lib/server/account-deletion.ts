import { APIError } from "better-auth/api";
import { prisma } from "#lib/server/database.ts";
import { Prisma, Role } from "@postpin-io/shared/db";
import { revokeInvitesOf } from "#lib/server/invite-links.ts";

/** Organizations in which this user is the only owner. Deleting the account would orphan them. */
export async function soleOwnerOrgs(userId: string, tx: Prisma.TransactionClient = prisma) {
	const owned = await tx.member.findMany({
		where: { userId, role: Role.OWNER },
		select: { organizationId: true, organization: { select: { name: true } } },
	});
	const counts = await Promise.all(
		owned.map((m) =>
			tx.member.count({ where: { organizationId: m.organizationId, role: Role.OWNER } }),
		),
	);
	return owned.filter((_, i) => counts[i] === 1).map((m) => m.organization);
}

export async function prepareAccountDeletion(user: { id: string; email: string }) {
	await prisma.$transaction(
		async (tx) => {
			const blocking = await soleOwnerOrgs(user.id, tx);
			if (blocking.length > 0) {
				throw new APIError("BAD_REQUEST", {
					message: `You're the last owner of ${blocking.map((o) => o.name).join(", ")}. Make someone else owner or delete the organization first.`,
				});
			}
			const memberships = await tx.member.findMany({ where: { userId: user.id } });
			for (const m of memberships) await revokeInvitesOf(tx, m, null);
			await tx.invitation.deleteMany({ where: { email: user.email, status: "pending" } });
		},
		{ isolationLevel: "Serializable" },
	);
}
