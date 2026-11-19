import { describe, expect, it } from "vitest";
import { GuideStatus, Role } from "@postpin-io/shared/db/enums";
import {
	getGuideAvailability,
	getGuideProgress,
	getGuidesEnabled,
	restartGuide,
	saveGuideProgress,
	setGuidesEnabled,
} from "#lib/components/guides/guides.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { STARTED, COMPLETED, SKIPPED } = GuideStatus;

describe("guide progress", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuideProgress(), 401);
		await expectStatus(saveGuideProgress({ guideId: "first-upload", status: STARTED }), 401);
		await expectStatus(restartGuide("first-upload"), 401);
	});

	it("is empty for a fresh account: every guide may start", async () => {
		signIn(await f.createUser());
		expect(await getGuideProgress()).toEqual({});
	});

	it("keeps step and context of a started guide, and adds to the context", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({
			guideId: "first-upload",
			status: STARTED,
			step: "create-timeline",
			context: { projectId: "p1" },
		});
		await saveGuideProgress({
			guideId: "first-upload",
			status: STARTED,
			step: "upload-export",
			context: { projectId: "p1", timelineId: "t1" },
		});
		expect(await getGuideProgress()).toEqual({
			"first-upload": {
				status: STARTED,
				step: "upload-export",
				context: { projectId: "p1", timelineId: "t1" },
			},
		});
	});

	it("keeps the context when a step is saved without one", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({ guideId: "first-upload", status: STARTED, context: { a: "1" } });
		await saveGuideProgress({ guideId: "first-upload", status: STARTED, step: "processing" });
		expect((await getGuideProgress())["first-upload"]?.context).toEqual({ a: "1" });
	});

	it("forgets step and context once completed or skipped", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({
			guideId: "first-upload",
			status: STARTED,
			step: "processing",
			context: { exportId: "e1" },
		});
		await saveGuideProgress({ guideId: "first-upload", status: COMPLETED });
		await saveGuideProgress({ guideId: "share-link", status: SKIPPED, step: "copy" });
		expect(await getGuideProgress()).toEqual({
			"first-upload": { status: COMPLETED, step: null, context: null },
			"share-link": { status: SKIPPED, step: null, context: null },
		});
	});

	it("only reads and writes the signed-in user's own progress", async () => {
		const me = await f.createUser();
		const someone = await f.createUser();
		signIn(someone);
		await saveGuideProgress({ guideId: "share-link", status: COMPLETED });
		signIn(me);
		expect(await getGuideProgress()).toEqual({});
		await restartGuide("share-link");
		expect(
			await prisma.guideProgress.count({ where: { userId: someone.id, guideId: "share-link" } }),
		).toBe(1);
	});

	it("restarting forgets the guide, so it starts on its own again", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({ guideId: "first-upload", status: COMPLETED });
		await saveGuideProgress({ guideId: "share-link", status: COMPLETED });
		await restartGuide("first-upload");
		expect(Object.keys(await getGuideProgress())).toEqual(["share-link"]);
	});

	it("rejects unknown guides and statuses", async () => {
		signIn(await f.createUser());
		await expectStatus(
			// @ts-expect-error not a guide
			saveGuideProgress({ guideId: "nope", status: STARTED }),
			400,
		);
		await expectStatus(
			// @ts-expect-error not a status
			saveGuideProgress({ guideId: "first-upload", status: "DONE" }),
			400,
		);
	});
});

describe("guides on and off", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuidesEnabled(), 401);
		await expectStatus(setGuidesEnabled(false), 401);
	});

	it("is on for a fresh account, and stays as the user switched it", async () => {
		const me = await f.createUser();
		signIn(me);
		expect(await getGuidesEnabled()).toBe(true);
		await setGuidesEnabled(false);
		expect(await getGuidesEnabled()).toBe(false);
		await setGuidesEnabled(true);
		expect(await getGuidesEnabled()).toBe(true);
	});

	it("only switches the signed-in user's guides", async () => {
		const me = await f.createUser();
		const someone = await f.createUser();
		signIn(me);
		await setGuidesEnabled(false);
		signIn(someone);
		expect(await getGuidesEnabled()).toBe(true);
	});

	it("keeps the progress when switched off", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({ guideId: "share-link", status: STARTED, step: "panels" });
		await setGuidesEnabled(false);
		expect((await getGuideProgress())["share-link"]?.status).toBe(STARTED);
	});

	it("rejects anything but a boolean", async () => {
		signIn(await f.createUser());
		// @ts-expect-error not a boolean
		await expectStatus(setGuidesEnabled("off"), 400);
	});
});

describe("guide availability", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuideAvailability(), 401);
	});

	it("has no navigation tour without an organization", async () => {
		signIn(await f.createUser());
		expect((await getGuideAvailability()).navigation).toBe(false);
	});

	it("has the navigation tour once there is an export to walk to", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, Role.OWNER);
		signIn(me.user, org.id);
		expect((await getGuideAvailability()).navigation).toBe(false);
		const timeline = await f.createTimeline(await f.createProject(org, { creator: me.user }));
		expect((await getGuideAvailability()).navigation).toBe(false);
		await f.createExport(timeline);
		expect((await getGuideAvailability()).navigation).toBe(true);
	});

	it("only counts exports the member may open", async () => {
		const org = await f.createOrg();
		const owner = await f.createMember(org, Role.OWNER);
		await f.createExport(
			await f.createTimeline(await f.createProject(org, { creator: owner.user })),
		);
		const reviewer = await f.createMember(org, Role.REVIEWER);
		signIn(reviewer.user, org.id);
		expect((await getGuideAvailability()).navigation).toBe(false);
	});
});
