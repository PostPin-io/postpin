import nodemailer from "nodemailer";
import {
	SMTP_HOST,
	SMTP_MAIL_FROM,
	SMTP_PASSWORD,
	SMTP_PORT,
	SMTP_SECURE,
	SMTP_USER,
} from "$app/env/private";
import { LOGO_CID, type Email } from "./emails/layout.ts";
import logo from "./emails/logo.png?inline";

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
	host: SMTP_HOST,
	port: SMTP_PORT,
	secure: SMTP_SECURE,
	auth: {
		user: SMTP_USER,
		pass: SMTP_PASSWORD,
	},
});

try {
	await transporter.verify();
	console.log("Server is ready to take our messages");
} catch (err) {
	console.error("Verification failed:", err);
}

/** Sends a mail from `emails/templates.ts`: HTML with a plain-text alternative */
export function sendEmail(to: string, email: Email, options: { replyTo?: string } = {}) {
	return transporter.sendMail({
		from: SMTP_MAIL_FROM ?? SMTP_USER,
		to,
		subject: email.subject,
		text: email.text,
		html: email.html,
		replyTo: options.replyTo,
		// Inline, so the logo shows without "load remote images" and without a public URL
		attachments: email.html.includes(`cid:${LOGO_CID}`)
			? [{ filename: "postpin.png", path: logo, cid: LOGO_CID, contentDisposition: "inline" }]
			: [],
	});
}
