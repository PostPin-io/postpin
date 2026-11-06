import { expect, it } from "vitest";
import { sendInvitationEmail } from "#lib/server/invitations.ts";
import { deleteMediaFiles } from "#lib/server/media.ts";
import { fakes } from "../helpers/fakes.ts";

it("records e-mails instead of sending them", async () => {
	await sendInvitationEmail({ id: "inv1", email: "a@test.local" }, "Acme", "Ann");
	expect(fakes.emails).toEqual([
		expect.objectContaining({
			to: "a@test.local",
			subject: "You're invited to join Acme",
			text: expect.stringContaining("http://localhost:5173/auth/invite/inv1"),
		}),
	]);
});

it("records S3 calls instead of sending them", async () => {
	await deleteMediaFiles("media1");
	expect(fakes.s3[0]).toMatchObject({ command: "ListObjectsV2Command" });
});
