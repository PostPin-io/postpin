/**
 * One layout for every mail PostPin sends: an HTML part plus a plain-text part with the same
 * content. Tables and inline styles only, since many mail clients drop <style> and flexbox.
 * Simple, mostly text, one link target per mail and a matching text part keep spam scores low.
 */

/** Content-ID of the logo, attached inline by sendEmail (remote images are blocked by default) */
export const LOGO_CID = "logo@postpin";

export type EmailContent = {
	subject: string;
	/** Preview line next to the subject in the inbox */
	preheader: string;
	heading: string;
	paragraphs: string[];
	/** Text someone wrote themselves, e.g. the note of a share link; kept as written */
	quote?: { label: string; text: string };
	action?: { label: string; url: string };
	/** Small print below the button, e.g. how long the link works */
	details?: string[];
	/** Why the recipient got this mail */
	footer: string;
	/** BETTER_AUTH_URL; the footer links to the instance */
	appUrl: string;
};

export type Email = { subject: string; text: string; html: string };

// daisyUI's light theme, as the app uses it
const color = {
	page: "#f4f4f5",
	card: "#ffffff",
	border: "#e4e4e7",
	heading: "#18181b",
	text: "#3f3f46",
	muted: "#71717a",
	primary: "#422ad5",
	onPrimary: "#ffffff",
	quote: "#f4f4f5",
};
const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

export function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/** Escaped, with line breaks kept */
const multiline = (value: string) => escapeHtml(value).replaceAll(/\r?\n/g, "<br>");

const host = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
};

export function renderEmail(content: EmailContent): Email {
	return { subject: content.subject, text: renderText(content), html: renderHtml(content) };
}

function renderText(c: EmailContent) {
	const blocks = [c.heading, ...c.paragraphs];
	if (c.quote) {
		blocks.push(`${c.quote.label}:\n${c.quote.text.replaceAll(/^/gm, "> ")}`);
	}
	if (c.action) blocks.push(`${c.action.label}:\n${c.action.url}`);
	if (c.details?.length) blocks.push(c.details.join("\n"));
	blocks.push(`--\n${c.footer}\nPostPin · ${c.appUrl}`);
	return blocks.join("\n\n") + "\n";
}

function renderHtml(c: EmailContent) {
	const p = (text: string, style = "") =>
		`<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${color.text};${style}">${text}</p>`;

	const quote = c.quote
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
<tr><td style="border-left:3px solid ${color.primary};background:${color.quote};border-radius:0 6px 6px 0;padding:12px 16px;">
<p style="margin:0 0 4px;font-size:12px;line-height:18px;font-weight:600;color:${color.muted};">${escapeHtml(c.quote.label)}</p>
<p style="margin:0;font-size:15px;line-height:24px;color:${color.heading};">${multiline(c.quote.text)}</p>
</td></tr></table>`
		: "";

	// A padded table cell instead of a padded <a>, so Outlook shows the whole button
	const action = c.action
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td align="center" bgcolor="${color.primary}" style="border-radius:6px;">
<a href="${escapeHtml(c.action.url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${font};font-size:15px;line-height:20px;font-weight:600;color:${color.onPrimary};text-decoration:none;border-radius:6px;">${escapeHtml(c.action.label)}</a>
</td></tr></table>`
		: "";

	const details = (c.details ?? [])
		.map((d) => p(escapeHtml(d), `font-size:13px;line-height:20px;color:${color.muted};`))
		.join("");

	const fallback = c.action
		? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${color.border};font-size:12px;line-height:18px;color:${color.muted};">If the button doesn't work, copy this link into your browser:<br>
<a href="${escapeHtml(c.action.url)}" target="_blank" style="color:${color.primary};word-break:break-all;">${escapeHtml(c.action.url)}</a></p>`
		: "";

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${color.page};font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(c.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.page}" style="background:${color.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 4px 20px;">
<a href="${escapeHtml(c.appUrl)}" target="_blank" style="text-decoration:none;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="cid:${LOGO_CID}" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;"></td>
<td style="vertical-align:middle;padding-left:8px;font-family:${font};font-size:20px;line-height:24px;font-weight:700;color:${color.heading};">PostPin</td>
</tr></table></a>
</td></tr>
<tr><td bgcolor="${color.card}" style="background:${color.card};border:1px solid ${color.border};border-radius:8px;padding:32px;font-family:${font};">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:700;color:${color.heading};">${escapeHtml(c.heading)}</h1>
${c.paragraphs.map((text) => p(multiline(text))).join("\n")}
${quote}
${action}
${details}
${fallback}
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${font};font-size:12px;line-height:18px;color:${color.muted};text-align:center;">
${escapeHtml(c.footer)}<br>
<a href="${escapeHtml(c.appUrl)}" target="_blank" style="color:${color.muted};text-decoration:underline;">PostPin · ${escapeHtml(host(c.appUrl))}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}
