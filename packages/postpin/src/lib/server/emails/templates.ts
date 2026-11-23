import { renderEmail } from "./layout.ts";

/**
 * Every mail PostPin sends. Pure functions without env, so tests and previews can render them;
 * the callers pass BETTER_AUTH_URL as `appUrl`.
 */

const mailDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });

const validFor = (ms: number) => {
	const hours = Math.round(ms / 3_600_000);
	return hours === 1 ? "1 hour" : `${hours} hours`;
};

/** "Hi Anna," or nothing when the account has no name */
const greeting = (name: string | null | undefined) => (name?.trim() ? [`Hi ${name.trim()},`] : []);

export function invitationEmail(m: {
	appUrl: string;
	url: string;
	email: string;
	orgName: string;
	inviterName: string;
	validForMs: number;
}) {
	return renderEmail({
		appUrl: m.appUrl,
		subject: `${m.inviterName} invited you to join ${m.orgName} on PostPin`,
		preheader: `Accept the invitation to review videos with ${m.orgName}.`,
		heading: `Join ${m.orgName} on PostPin`,
		paragraphs: [
			`${m.inviterName} invited you to join the organization ${m.orgName}. On PostPin your team reviews video exports and leaves frame-accurate markers that sync back into the edit.`,
		],
		action: { label: "Accept invitation", url: m.url },
		details: [`The invitation is valid for ${validFor(m.validForMs)}.`],
		footer: `This invitation was sent to ${m.email}. If you weren't expecting it, you can ignore this email.`,
	});
}

export function shareLinkEmail(m: {
	appUrl: string;
	url: string;
	senderName: string;
	exportName: string;
	note: string | null;
	expiresAt: Date | null;
}) {
	return renderEmail({
		appUrl: m.appUrl,
		subject: `${m.senderName} shared "${m.exportName}" with you`,
		preheader: `Watch "${m.exportName}" and add your comments, no account needed.`,
		heading: `${m.senderName} shared a video with you`,
		paragraphs: [
			`Watch "${m.exportName}" in your browser and add your comments. You don't need an account.`,
		],
		...(m.note && { quote: { label: `Note from ${m.senderName}`, text: m.note } }),
		action: { label: "Watch and review", url: m.url },
		...(m.expiresAt && { details: [`The link works until ${mailDate.format(m.expiresAt)}.`] }),
		footer: `${m.senderName} sent you this link with PostPin. Reply to this email to answer them directly.`,
	});
}

export function verifyEmailEmail(m: {
	appUrl: string;
	url: string;
	name: string | null;
	email: string;
	validForMs: number;
}) {
	return renderEmail({
		appUrl: m.appUrl,
		subject: "Verify your email address for PostPin",
		preheader: "Confirm your email address to finish setting up your account.",
		heading: "Verify your email address",
		paragraphs: [
			...greeting(m.name),
			`Please confirm that ${m.email} is your email address. Then you can use your PostPin account.`,
		],
		action: { label: "Verify email address", url: m.url },
		details: [`The link is valid for ${validFor(m.validForMs)}.`],
		footer: "If you didn't create a PostPin account, you can ignore this email.",
	});
}

export function resetPasswordEmail(m: {
	appUrl: string;
	url: string;
	name: string | null;
	email: string;
	validForMs: number;
}) {
	return renderEmail({
		appUrl: m.appUrl,
		subject: "Reset your PostPin password",
		preheader: "Choose a new password for your PostPin account.",
		heading: "Reset your password",
		paragraphs: [
			...greeting(m.name),
			`Someone asked to reset the password of the PostPin account ${m.email}. Choose a new password with the button below.`,
		],
		action: { label: "Choose a new password", url: m.url },
		details: [`The link is valid for ${validFor(m.validForMs)}.`],
		footer: "If you didn't ask for this, you can ignore this email. Your password stays the same.",
	});
}

export function accountDeletedEmail(m: { appUrl: string; name: string | null }) {
	return renderEmail({
		appUrl: m.appUrl,
		subject: "Your PostPin account was deleted",
		preheader: "Your account and all its sessions have been deleted.",
		heading: "Your account was deleted",
		paragraphs: [
			...greeting(m.name),
			"Your PostPin account and all its sessions have been deleted.",
			"Markers and comments you wrote stay with their organizations and show as “Deleted User”.",
		],
		footer:
			"If you didn't delete your account, contact the administrator of this PostPin instance.",
	});
}

export function testEmail(m: { appUrl: string }) {
	return renderEmail({
		appUrl: m.appUrl,
		subject: "PostPin test email",
		preheader: "Your PostPin instance can send emails.",
		heading: "SMTP works",
		paragraphs: [
			"This test email was sent from the admin page. Your PostPin instance can send emails.",
		],
		action: { label: "Open admin page", url: `${m.appUrl}/admin` },
		footer: "You got this email because you clicked “Send test email” on the admin page.",
	});
}
