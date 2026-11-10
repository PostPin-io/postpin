import { prisma } from "#lib/server/database.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many people this sender sent this link to in the last 24 hours */
export async function recipientsSentToday(shareLinkId: string, senderId: string, now = new Date()) {
	const mails = await prisma.shareLinkMail.findMany({
		where: { shareLinkId, senderId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
		select: { recipients: true },
	});
	return mails.reduce((sum, mail) => sum + mail.recipients.length, 0);
}
