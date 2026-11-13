import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { webUploadSnapshot } from "@postpin-io/shared/logic/web-upload";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { setCutSensitivity } from "#lib/components/review/cuts.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import { fakes } from "../../../../helpers/fakes.ts";
import { signIn } from "../../../../helpers/request-event.ts";

const { MEMBER, REVIEWER } = Role;
const FPS_24 = { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false };

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

const snapshot = () =>
	webUploadSnapshot({
		id: w.exp1.id,
		name: "Trailer",
		fileName: "trailer.mp4",
		timing: { frameRate: FPS_24, startFrameIndex: 0, durationFrameCount: 192 },
		userSet: [],
		cutLevel: "medium",
	});
const SCORES = {
	scores: [
		[48, 0.7],
		[96, 0.25],
		[144, 0.7],
	],
};

/** exp1 as a processed web upload, with the cut detection's scores unless `scores` is null */
async function webUpload(scores: object | null = SCORES, status = "COMPLETED" as const) {
	await prisma.export.update({
		where: { id: w.exp1.id },
		data: {
			timelineSnapshot: snapshot() as never,
			media: {
				update: {
					status,
					shotThumbnails: { count: 1, width: 320, height: 180 },
					...(scores && { sceneScores: scores }),
				},
			},
		},
	});
}

const clipsOf = async () =>
	(
		(await prisma.export.findUniqueOrThrow({ where: { id: w.exp1.id } }))
			.timelineSnapshot as unknown as TimelineSnapshot
	).tracks[0]!.clips;

describe("setCutSensitivity", () => {
	it("rebuilds the shots from the stored scores and renders their thumbnails again", async () => {
		await webUpload();
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);

		expect(await setCutSensitivity({ exportId: w.exp1.id, level: "sensitive" })).toEqual({
			shotCount: 4,
		});
		expect((await clipsOf()).map((c) => c.startFrameIndex)).toEqual([0, 48, 96, 144]);

		const media = await prisma.media.findUniqueOrThrow({ where: { id: w.exp1.mediaId! } });
		expect(media.shotThumbnails).toBeNull();
		expect(fakes.queue).toEqual([
			{
				queue: "media-light",
				method: "add",
				args: ["shotThumbnails", { mediaId: w.exp1.mediaId }, expect.anything()],
			},
		]);

		await setCutSensitivity({ exportId: w.exp1.id, level: "insensitive" });
		expect((await clipsOf()).map((c) => c.startFrameIndex)).toEqual([0, 48, 144]);
	});

	it("'none' makes it one clip, even without scores", async () => {
		await webUpload(null);
		signIn(w.owner.user, w.org.id);
		expect(await setCutSensitivity({ exportId: w.exp1.id, level: "none" })).toEqual({
			shotCount: 1,
		});
	});

	it("409 for a level without scores, while processing and for plugin exports", async () => {
		signIn(w.owner.user, w.org.id);
		await webUpload(null);
		await expectStatus(setCutSensitivity({ exportId: w.exp1.id, level: "medium" }), 409);

		await webUpload(SCORES, "PROCESSING" as "COMPLETED");
		await expectStatus(setCutSensitivity({ exportId: w.exp1.id, level: "medium" }), 409);

		await prisma.export.update({
			where: { id: w.exp1.id },
			data: { timelineSnapshot: { ...snapshot(), metadata: {} } as never },
		});
		await prisma.media.update({ where: { id: w.exp1.mediaId! }, data: { status: "COMPLETED" } });
		await expectStatus(setCutSensitivity({ exportId: w.exp1.id, level: "medium" }), 409);
		expect(fakes.queue).toEqual([]);
	});

	it("403 for a reviewer, 404 for another org", async () => {
		await webUpload();
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(setCutSensitivity({ exportId: w.exp1.id, level: "sensitive" }), 403);
		signIn(w.owner.user, w.org.id);
		await expectStatus(setCutSensitivity({ exportId: w.otherExp.id, level: "sensitive" }), 404);
		expect((await clipsOf()).length).toBe(1);
	});

	it("400 for an unknown level", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(setCutSensitivity({ exportId: w.exp1.id, level: "extreme" as "none" }), 400);
	});
});
