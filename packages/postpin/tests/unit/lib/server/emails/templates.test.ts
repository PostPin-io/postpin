import { describe, expect, it } from "vitest";
import { LOGO_CID, escapeHtml, renderEmail } from "#lib/server/emails/layout.ts";
import {
	accountDeletedEmail,
	invitationEmail,
	resetPasswordEmail,
	shareLinkEmail,
	testEmail,
	verifyEmailEmail,
} from "#lib/server/emails/templates.ts";

const appUrl = "https://app.postpin.io";

describe("renderEmail", () => {
	const content = {
		appUrl,
		subject: "Subject",
		preheader: "Preview line",
		heading: "Heading",
		paragraphs: ["First", "Second"],
		quote: { label: "Note from Ann", text: "line 1\nline 2" },
		action: { label: "Open", url: "https://app.postpin.io/x?a=1&b=2" },
		details: ["Valid for 1 hour."],
		footer: "Why you got this.",
	};

	it("writes the same content into the text part", () => {
		const { text } = renderEmail(content);
		expect(text).toBe(
			[
				"Heading",
				"First",
				"Second",
				"Note from Ann:\n> line 1\n> line 2",
				"Open:\nhttps://app.postpin.io/x?a=1&b=2",
				"Valid for 1 hour.",
				"--\nWhy you got this.\nPostPin · https://app.postpin.io",
			].join("\n\n") + "\n",
		);
	});

	it("links the button and the fallback to the action, shows the logo inline", () => {
		const { html } = renderEmail(content);
		expect(html.match(/href="https:\/\/app\.postpin\.io\/x\?a=1&amp;b=2"/g)).toHaveLength(2);
		expect(html).toContain(`src="cid:${LOGO_CID}"`);
		expect(html).toContain("Preview line");
		expect(html).toContain("line 1<br>line 2");
		expect(html).toContain("app.postpin.io</a>");
	});

	it("leaves out button, fallback and quote when there are none", () => {
		const { html } = renderEmail({ ...content, action: undefined, quote: undefined });
		expect(html).not.toContain("copy this link");
		expect(html).not.toContain("Note from");
	});

	it("escapes what users wrote", () => {
		const { html } = renderEmail({
			...content,
			heading: `<script>alert("x")</script>`,
			quote: { label: "Note", text: `<img src=x onerror="y">` },
		});
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img src=x");
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
			"&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
		);
	});
});

describe("templates", () => {
	it("invitation names inviter, org, recipient and validity", () => {
		const mail = invitationEmail({
			appUrl,
			url: `${appUrl}/auth/invite/inv1`,
			email: "x@test.local",
			orgName: "Acme",
			inviterName: "Alice",
			validForMs: 48 * 3600 * 1000,
		});
		expect(mail.subject).toBe("Alice invited you to join Acme on PostPin");
		for (const part of [mail.text, mail.html]) {
			expect(part).toContain(`${appUrl}/auth/invite/inv1`);
			expect(part).toContain("x@test.local");
			expect(part).toContain("48 hours");
		}
	});

	const share = {
		appUrl,
		url: `${appUrl}/s/abc`,
		senderName: "Hannes",
		exportName: "Cut 3",
		note: "Please check the ending",
		expiresAt: new Date("2026-11-16T12:00:00Z"),
	};

	it("share link quotes the note and names the expiry", () => {
		const mail = shareLinkEmail(share);
		expect(mail.subject).toBe('Hannes shared "Cut 3" with you');
		expect(mail.text).toContain("Note from Hannes:\n> Please check the ending");
		expect(mail.text).toContain(`${appUrl}/s/abc`);
		expect(mail.text).toContain("November 16, 2026");
	});

	it("share link without note and expiry says nothing about them", () => {
		const mail = shareLinkEmail({ ...share, note: null, expiresAt: null });
		expect(mail.text).not.toContain("Note from");
		expect(mail.text).not.toContain("works until");
	});

	it("verification and reset greet by name and name the validity", () => {
		const m = { appUrl, url: `${appUrl}/t`, name: "Anna", email: "a@x.io", validForMs: 3600_000 };
		for (const mail of [verifyEmailEmail(m), resetPasswordEmail(m)]) {
			expect(mail.text.split("\n\n")[1]).toBe("Hi Anna,");
			expect(mail.text).toContain("1 hour.");
			expect(mail.text).toContain("a@x.io");
		}
		expect(verifyEmailEmail({ ...m, name: " " }).text).not.toContain("Hi");
	});

	it("account deletion and test mail render", () => {
		expect(accountDeletedEmail({ appUrl, name: null }).html).not.toContain("copy this link");
		expect(testEmail({ appUrl }).text).toContain(`${appUrl}/admin`);
	});
});
