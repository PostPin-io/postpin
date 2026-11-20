import { mayUsePlugins } from "#lib/roles.ts";
import { prisma } from "./database.ts";

/**
 * Whether the user may sign a plugin in (approve a device code): the Member role in at least one
 * organization, or no organization yet (roles.ts, `mayUsePlugins`)
 */
export async function userMayUsePlugins(userId: string) {
	const memberships = await prisma.member.findMany({ where: { userId }, select: { role: true } });
	return mayUsePlugins(memberships.map((m) => m.role));
}
