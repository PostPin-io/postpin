import { describe, expect, it } from "vitest";
import { GuideStatus } from "@postpin-io/shared/db/enums";
import {
	getGuideProgress,
	restartGuide,
	saveGuideProgress,
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
