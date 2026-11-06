import { describe, expect, it } from "vitest";
import { INVITATION_TTL_MS, sendInvitationEmail } from "#lib/server/invitations.ts";
import { fakes } from "../../../helpers/fakes.ts";

describe("sendInvitationEmail", () => {
	it("sends one e-mail with org, inviter and the accept link", async () => {
		await sendInvitationEmail({ id: "inv123", email: "x@test.local" }, "Acme", "Alice");
		expect(fakes.emails).toEqual([
			{
				to: "x@test.local",
				subject: "You're invited to join Acme",
				text: expect.stringContaining("http://localhost:5173/auth/invite/inv123"),
			},
		]);
		expect(fakes.emails[0].text).toContain("Alice");
		expect(fakes.emails[0].text).toContain("Acme");
	});

	it("invitations live 48 hours", () => {
		expect(INVITATION_TTL_MS).toBe(48 * 3600 * 1000);
	});
});
