import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { endScreening, publishScreening } from "#lib/components/screening/screening.remote.ts";
import {
	createScreeningLink,
	revokeShareLink,
} from "#lib/components/sharing/share-links/share-links.remote.ts";
import { createShareGuest } from "#lib/server/share-guests.ts";
import { liveHub } from "#lib/server/live.ts";
import { GET as shareStream } from "../../../../../src/routes/live/shares/[token]/+server.ts";
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
const paused = { time: 3, paused: true, rate: 1 };

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
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead });
		const state = fakes.screenings.get(link.id);
		expect(state).toMatchObject(playhead);
		expect(state!.at).toBeGreaterThanOrEqual(before);
	});

	it.each([
		["a negative time", { ...playhead, time: -1 }],
		["an endless rate", { ...playhead, rate: Infinity }],
	])("400 for %s", async (_, bad) => {
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "s1", playhead: bad }), 400);
	});

	it("400 for an ordinary share link", async () => {
		const plain = await f.createShareLink(w.exp1, { creator: w.owner.user });
		await expectStatus(publishScreening({ linkId: plain.id, sessionId: "s1", playhead }), 400);
	});

	it.each([
		["expired", { expiresAt: new Date(Date.now() - 1000) }],
		["revoked", { revokedAt: new Date() }],
	])("410 for a %s link", async (_, change) => {
		await prisma.shareLink.update({ where: { id: link.id }, data: change });
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "s1", playhead }), 410);
		expect(fakes.screenings.size).toBe(0);
	});

	it("whoever may run the screening: a member their own link, an admin any, a reviewer none", async () => {
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "s1", playhead }), 403);
		const own = await createScreeningLink({ exportId: w.exp1.id, maxGuests: 5, timeZone: TZ });
		await publishScreening({ linkId: own.id, sessionId: "s2", playhead });

		// reviewers don't see share links at all
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "s1", playhead }), 404);

		await signInAs(w.org, ADMIN);
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead });
		expect([...fakes.screenings.keys()].sort()).toEqual([link.id, own.id].sort());
	});

	it("one session at a time: a new one takes over, the old one is turned away", async () => {
		await publishScreening({ linkId: link.id, sessionId: "old", playhead, claim: true });
		await publishScreening({ linkId: link.id, sessionId: "new", playhead: paused, claim: true });
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "old", playhead }), 409);
		expect(fakes.screenings.get(link.id)).toMatchObject(paused);

		// the owner itself just goes on, also after a reload (no claim)
		await publishScreening({ linkId: link.id, sessionId: "new", playhead });
		expect(fakes.screenings.get(link.id)).toMatchObject(playhead);
	});

	it("404 for an unknown link or another org's", async () => {
		await expectStatus(publishScreening({ linkId: "nope", sessionId: "s1", playhead }), 404);
		signIn(w.otherOwner.user, w.other.id);
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "s1", playhead }), 404);
	});
});

describe("endScreening", () => {
	it("the guests watch on their own again", async () => {
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead });
		await endScreening({ linkId: link.id, sessionId: "s1" });
		expect(fakes.screenings.has(link.id)).toBe(false);
	});

	it("an old session going away doesn't end the screening a newer one runs", async () => {
		await publishScreening({ linkId: link.id, sessionId: "old", playhead, claim: true });
		await publishScreening({ linkId: link.id, sessionId: "new", playhead, claim: true });
		await endScreening({ linkId: link.id, sessionId: "old" });
		expect(fakes.screenings.has(link.id)).toBe(true);
	});

	it("a report still on its way after the end doesn't start it again; a new screening does", async () => {
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead, claim: true });
		await endScreening({ linkId: link.id, sessionId: "s1" });
		await expectStatus(publishScreening({ linkId: link.id, sessionId: "s1", playhead }), 409);
		expect(fakes.screenings.has(link.id)).toBe(false);

		await publishScreening({ linkId: link.id, sessionId: "s2", playhead, claim: true });
		expect(fakes.screenings.has(link.id)).toBe(true);
	});

	it("403 for whoever may not run it", async () => {
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead });
		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(endScreening({ linkId: link.id, sessionId: "s1" }), 403);
		expect(fakes.screenings.has(link.id)).toBe(true);
	});
});

describe("revokeShareLink", () => {
	it("ends a running screening of the link at once", async () => {
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead });
		await revokeShareLink({ id: link.id });
		expect(fakes.screenings.has(link.id)).toBe(false);
	});
});

describe("GET /live/shares/[token]", () => {
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
			shareStream({ params: { token }, request, cookies: jar } as never),
		);
		return { response, controller };
	};

	/** Reads the stream's `data:` messages one by one */
	function messages(body: ReadableStream<Uint8Array>) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let text = "";
		return async function next() {
			for (;;) {
				const match = /data: (.*)\n\n/.exec(text);
				if (match) {
					text = text.slice(match.index + match[0].length);
					return JSON.parse(match[1]!);
				}
				const { value, done } = await reader.read();
				if (done) throw new Error("stream ended");
				text += decoder.decode(value);
			}
		};
	}

	/** The first `data:` message of the stream; ends the stream afterwards */
	async function firstMessage(token = link.token) {
		const { response, controller } = open(token);
		const message = await messages((await response).body!)();
		controller.abort();
		return message;
	}

	/** Opens the stream and hands back the hub's listener, as if Redis delivered an event */
	async function listen(token = link.token) {
		const subscribe = vi.spyOn(liveHub, "subscribe");
		const { response, controller } = open(token);
		const next = messages((await response).body!);
		const [channels, deliver] = subscribe.mock.calls.at(-1)!;
		subscribe.mockRestore();
		return { channels, deliver, next, controller };
	}

	it("starts with the presenter's playhead and the server's clock", async () => {
		await publishScreening({ linkId: link.id, sessionId: "s1", playhead });
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

	it("passes on the presenter's playhead and the screening's end", async () => {
		const { channels, deliver, next, controller } = await listen();
		expect(channels).toEqual([`live:share-link:${link.id}`]);
		await next(); // the current state

		const state = { ...playhead, at: Date.now() };
		deliver({ type: "screening", linkId: link.id, state });
		expect(await next()).toEqual({ type: "screening", state, now: expect.any(Number) });
		deliver({ type: "screening", linkId: link.id, state: null });
		expect((await next()).state).toBeNull();
		controller.abort();
	});

	it("tells the guest at once when the link is deleted", async () => {
		const { deliver, next, controller } = await listen();
		await next();
		deliver({ type: "shareLinkRevoked", linkId: link.id });
		expect(await next()).toEqual({ type: "revoked" });
		controller.abort();
	});

	it("an ordinary link's guest gets it too, without screening messages", async () => {
		const plain = await f.createShareLink(w.exp1, { creator: w.owner.user });
		await createShareGuest(cookies, { ...plain, maxGuests: null }, "Bob");
		const { channels, deliver, next, controller } = await listen(plain.token);
		expect(channels).toEqual([`live:share-link:${plain.id}`]);

		deliver({ type: "screening", linkId: plain.id, state: { ...playhead, at: 1 } });
		deliver({ type: "shareLinkRevoked", linkId: plain.id });
		// the first message is the deletion: nothing about a screening before it
		expect(await next()).toEqual({ type: "revoked" });
		controller.abort();
	});

	it("after Redis was gone: says whether the link was deleted meanwhile", async () => {
		const { deliver, next, controller } = await listen();
		await next();
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		deliver({ type: "resync" });
		expect(await next()).toEqual({ type: "revoked" });
		controller.abort();
	});

	it("410 once the link is revoked", async () => {
		await prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
		await expectStatus(open().response, 410);
	});
});
