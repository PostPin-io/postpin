import type { Queues } from "@postpin-io/shared/queue";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";

/** Expired invitations stay this long, so an invitee still sees "expired" instead of "not found" */
export const INVITATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function cleanup(_job: TypedJob<typeof Queues.maintenance, "cleanup">) {
	const now = new Date();
	const [sessions, deviceCodes, verifications, invitations] = await prisma.$transaction([
		prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
		prisma.deviceCode.deleteMany({ where: { expiresAt: { lt: now } } }),
		prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
		prisma.invitation.deleteMany({
			where: { expiresAt: { lt: new Date(now.getTime() - INVITATION_RETENTION_MS) } },
		}),
	]);
	const counts = {
		sessions: sessions.count,
		deviceCodes: deviceCodes.count,
		verifications: verifications.count,
		invitations: invitations.count,
	};
	console.log("Cleanup done", counts);
	return counts;
}
