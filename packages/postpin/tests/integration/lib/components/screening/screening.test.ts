import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { endScreening, publishScreening } from "#lib/components/screening/screening.remote.ts";
import {
	createScreeningLink,
	revokeShareLink,
} from "#lib/components/sharing/share-links/share-links.remote.ts";
import { createShareGuest } from "#lib/server/share-guests.ts";
import { GET as screeningStream } from "../../../../../src/routes/live/screenings/[token]/+server.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { fakeCookies } from "../../../../helpers/cookies.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import { fakes } from "../../../../helpers/fakes.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn } from "../../../../helpers/request-event.ts";

const { ADMIN, MEMBER, REVIEWER } = Role;
const TZ = "Europe/Berlin";
const playhead = { time: 12.5, paused: false, rate: 1 };

let w: ContentWorld;
let link: Awaited<ReturnType<typeof createScreeningLink>>;
beforeEach(async () => {
	w = await contentWorld();
	signIn(w.owner.user, w.org.id);
	link = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 30, timeZone: TZ });
});

describe("publishScreening", () => {
	it("keeps the presenter's playhead, stamped with the server's time", async () => {
		const before = Date.now();
		await publishScreening({ linkId: link.id, playhead });
		const state = fakes.screenings.get(link.id);
		expect(state).toMatchObject(playhead);
		expect(state!.at).toBeGreaterThanOrEqual(before);
	});

	it.each([
		["a negative time", { ...playhead, time: -1 }],
		["an endless rate", { ...playhead, rate: Infinity }],
	])("400 for %s", async (_, bad) => {
		await expectStatus(publishScreening({ linkId: link.id, playhead: bad }), 400);
	});

	it("400 for an ordinary share link", async () => {
		const plain = await f.createShareLink(w.exp1, { creator: w.owner.user });
		await expectStatus(publishScreening({ linkId: plain.id, playhead }), 400);
	});

	it.each([
		["expired", { expiresAt: new Date(Date.now() - 1000) }],
		["revoked", { revokedAt: new Date() }],
	])("409 for a %s link", async (_, change) => {
		await prisma.shareLink.update({ where: { id: link.id }, data: change });
		await expectStatus(publishScreening({ linkId: link.id, playhead }), 409);
		expect(fakes.screenings.size).toBe(0);
	});

	it("whoever may run the screening: a member their own link, an admin any, a reviewer none", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(publishScreening({ linkId: link.id, playhead }), 403);
		const own = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 5, timeZone: TZ });
		await publishScreening({ linkId: own.id, playhead });

		// reviewers don't see share links at all
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(publishScreening({ linkId: link.id, playhead }), 404);

		await signInAs(w.org, ADMIN);
		await publishScreening({ linkId: link.id, playhead });
		expect([...fakes.screenings.keys()].sort()).toEqual([link.id, own.id].sort());
	});

	it("404 for an unknown link or another org's", async () => {
		await expectStatus(publishScreening({ linkId: "nope", playhead }), 404);
		signIn(w.otherOwner.user, w.other.id);
		await expectStatus(publishScreening({ linkId: link.id, playhead }), 404);
	});
});

describe("endScreening", () => {
	it("the guests watch on their own again", async () => {
		await publishScreening({ linkId: link.id, playhead });
		await endScreening({ linkId: link.id });
		expect(fakes.screenings.has(link.id)).toBe(false);
	});

	it("403 for whoever may not run it", async () => {
		await publishScreening({ linkId: link.id, playhead });
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(endScreening({ linkId: link.id }), 403);
		expect(fakes.screenings.has(link.id)).toBe(true);
	});
});

describe("revokeShareLink", () => {
	it("ends a running screening of the link at once", async () => {
		await publishScreening({ linkId: link.id, playhead });
		await revokeShareLink({ id: link.id });
		expect(fakes.screenings.has(link.id)).toBe(false);
	});
});

describe("GET /live/screenings/[token]", () => {
	let cookies: ReturnType<typeof fakeCookies>["cookies"];
	beforeEach(async () => {
		cookies = fakeCookies().cookies;
		const full = await prisma.shareLink.findUniqueOrThrow({ where: { id: link.id } });
		await createShareGuest(cookies, full, "Anna");
	});

	const open = (token = link.token, jar = cookies) => {
		const controller = new AbortController();
		const request = new Request("http://localhost/", { signal: controller.signal });
		const response = Promise.resolve(
			screeningStream({ params: { token }, request, cookies: jar } as never),
		);
		return { response, controller };
	};

	/** The first `data:` message of the stream; ends the stream afterwards */
	async function firstMessage(token = link.token) {
		const { response, controller } = open(token);
		const reader = (await response).body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (!/data: .*\n\n/.test(text)) {
			const { value, done } = await reader.read();
			if (done) break;
			text += decoder.decode(value);
		}
		controller.abort();
		return JSON.parse(/data: (.*)\n\n/.exec(text)![1]!);
	}

	it("starts with the presenter's playhead and the server's clock", async () => {
		await publishScreening({ linkId: link.id, playhead });
		const message = await firstMessage();
		expect(message).toEqual({
			type: "screening",
			state: { ...playhead, at: expect.any(Number) },
			now: expect.any(Number),
		});
		expect(message.now).toBeGreaterThanOrEqual(message.state.at);
	});

	it("no screening running: an empty state", async () => {
		expect((await firstMessage()).state).toBeNull();
	});

	it("401 without the guest cookie", async () => {
		await expectStatus(open(link.token, fakeCookies().cookies).response, 401);
	});

	it("404 for an ordinary share link", async () => {
		const plain = await f.createShareLink(w.exp1, { creator: w.owner.user });
		await createShareGuest(cookies, { ...plain, maxGuests: null }, "Anna");
		await expectStatus(open(plain.token).response, 404);
	});

	it("410 once the link is revoked", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		await expectStatus(open().response, 410);
	});
});
