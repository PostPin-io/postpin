import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { MAX_RECIPIENTS_PER_DAY } from "@postpin-io/shared/logic/share-links";
import { sendShareLink } from "#lib/components/sharing/share-links.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { fakes } from "../../../../helpers/fakes.ts";
import { signIn } from "../../../../helpers/request-event.ts";

const { MEMBER, REVIEWER } = Role;

let w: ContentWorld;
let link: Awaited<ReturnType<typeof f.createShareLink>>;

beforeEach(async () => {
	w = await contentWorld();
	link = await f.createShareLink(w.exp1, { creator: w.owner.user });
	await prisma.shareLink.update({
		where: { id: link.id },
		data: { note: "Please check the ending" },
	});
	signIn(w.owner.user, w.org.id);
});

const addresses = (n: number, prefix = "u") =>
	Array.from({ length: n }, (_, i) => `${prefix}${i}@example.com`);

describe("sendShareLink", () => {
	it("sends one mail per recipient with link and note; replies go to the sender", async () => {
		const res = await sendShareLink({
			id: link.id,
			emails: ["Anna@Example.com", "ben@example.com", "anna@example.com"],
		});
		expect(res).toEqual({ sent: 2, failed: [] });

		expect(fakes.emails.map((m) => m.to)).toEqual(["anna@example.com", "ben@example.com"]);
		for (const mail of fakes.emails) {
			expect(mail.replyTo).toBe(w.owner.user.email);
			expect(mail.text).toContain(`http://localhost:5173/s/${link.token}`);
			expect(mail.text).toContain("Please check the ending");
		}
	});

	it("logs the send for the rate limit", async () => {
		await sendShareLink({ id: link.id, emails: ["anna@example.com"] });
		expect(await prisma.shareLinkMail.findMany({ where: { shareLinkId: link.id } })).toMatchObject([
			{ senderId: w.owner.user.id, recipients: ["anna@example.com"] },
		]);
	});

	it.each([
		["no address", []],
		["an invalid address", ["nope"]],
		["more than 20 at once", addresses(21)],
	])("400 for %s, nothing sent", async (_, emails) => {
		await expectStatus(sendShareLink({ id: link.id, emails }), 400);
		expect(fakes.emails).toEqual([]);
	});

	it.each([
		["expired", { expiresAt: new Date(Date.now() - 1000) }],
		["revoked", { revokedAt: new Date() }],
	])("409 for a %s link, nothing sent", async (_, change) => {
		await prisma.shareLink.update({ where: { id: link.id }, data: change });
		await expectStatus(sendShareLink({ id: link.id, emails: ["anna@example.com"] }), 409);
		expect(fakes.emails).toEqual([]);
	});

	it("404 for an unknown link", async () => {
		await expectStatus(sendShareLink({ id: "nope", emails: ["anna@example.com"] }), 404);
	});

	it("403 for a reviewer, 404 for another org", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(sendShareLink({ id: link.id, emails: ["anna@example.com"] }), 403);

		signIn(w.otherOwner.user, w.other.id);
		await expectStatus(sendShareLink({ id: link.id, emails: ["anna@example.com"] }), 404);
		expect(fakes.emails).toEqual([]);
	});

	it("a member with access may send someone else's link", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		expect(await sendShareLink({ id: link.id, emails: ["anna@example.com"] })).toMatchObject({
			sent: 1,
		});
	});
});

describe("rate limit", () => {
	it(`429 once a sender passes ${MAX_RECIPIENTS_PER_DAY} recipients a day on one link`, async () => {
		for (let i = 0; i < MAX_RECIPIENTS_PER_DAY / 10; i++) {
			await sendShareLink({ id: link.id, emails: addresses(10, `batch${i}-`) });
		}
		fakes.reset();
		await expectStatus(sendShareLink({ id: link.id, emails: ["one@more.com"] }), 429);
		expect(fakes.emails).toEqual([]);
	});

	it("sends older than 24 hours don't count", async () => {
		await prisma.shareLinkMail.create({
			data: {
				shareLinkId: link.id,
				senderId: w.owner.user.id,
				recipients: addresses(MAX_RECIPIENTS_PER_DAY),
				createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
			},
		});
		expect(await sendShareLink({ id: link.id, emails: ["anna@example.com"] })).toMatchObject({
			sent: 1,
		});
	});

	it("counts per sender and per link", async () => {
		await prisma.shareLinkMail.create({
			data: {
				shareLinkId: link.id,
				senderId: w.owner.user.id,
				recipients: addresses(MAX_RECIPIENTS_PER_DAY),
			},
		});

		// the same sender on another link
		const other = await f.createShareLink(w.exp1, { creator: w.owner.user });
		expect(await sendShareLink({ id: other.id, emails: ["anna@example.com"] })).toMatchObject({
			sent: 1,
		});

		// another sender on the same link
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		expect(await sendShareLink({ id: link.id, emails: ["anna@example.com"] })).toMatchObject({
			sent: 1,
		});
	});
});
