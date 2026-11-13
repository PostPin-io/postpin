import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@postpin-io/shared/db";
import { Role } from "@postpin-io/shared/db/enums";
import { webUploadSnapshot } from "@postpin-io/shared/logic/web-upload";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import type { CutList } from "@postpin-io/shared/logic/cut-list";
import { importCutList, setCutSensitivity } from "#lib/components/review/cuts.remote.ts";
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
		// a new generation, stored with the shots: older renders still running don't publish
		expect(media.shotThumbnailsGeneration).toEqual(expect.any(String));
		expect(fakes.queue).toEqual([
			{
				queue: "media-light",
				method: "add",
				args: [
					"shotThumbnails",
					{ mediaId: w.exp1.mediaId, generation: media.shotThumbnailsGeneration },
					expect.anything(),
				],
			},
		]);

		await setCutSensitivity({ exportId: w.exp1.id, level: "insensitive" });
		expect((await clipsOf()).map((c) => c.startFrameIndex)).toEqual([0, 48, 144]);
	});

	it("every change is a newer generation than the one before", async () => {
		await webUpload();
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const generation = async () =>
			(await prisma.media.findUniqueOrThrow({ where: { id: w.exp1.mediaId! } }))
				.shotThumbnailsGeneration!;

		await setCutSensitivity({ exportId: w.exp1.id, level: "sensitive" });
		const first = await generation();
		await new Promise((resolve) => setTimeout(resolve, 2));
		await setCutSensitivity({ exportId: w.exp1.id, level: "insensitive" });
		expect((await generation()) > first).toBe(true);
	});

	it("'none' makes it one clip, even without scores", async () => {
		await webUpload(null);
		signIn(w.owner.user, w.org.id);
		expect(await setCutSensitivity({ exportId: w.exp1.id, level: "none" })).toEqual({
			shotCount: 1,
		});
	});

	it("409 when the tracks come from a cut list: nothing is estimated to change", async () => {
		signIn(w.owner.user, w.org.id);
		await webUpload();
		const s = snapshot();
		await prisma.export.update({
			where: { id: w.exp1.id },
			data: { timelineSnapshot: { ...s, metadata: { ...s.metadata, cutsFrom: "edl" } } as never },
		});
		const res = await expectStatus(
			setCutSensitivity({ exportId: w.exp1.id, level: "medium" }),
			409,
		);
		expect(res.body.message).toMatch(/editing software/);
		expect(fakes.queue).toEqual([]);
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

describe("importCutList", () => {
	// exp1 as a processed web upload at 24 fps, 8 s (192 frames) from 00:00:00:00
	const event = (name: string, from: string, to: string) => ({
		name,
		in: from,
		out: to,
		sourceIn: "00:00:10:00",
	});
	const marker = (name: string, at: string, label = "Blue") => ({
		name,
		note: "a note",
		at,
		duration: 0,
		host: "Resolve" as const,
		label,
	});
	const LIST: CutList = {
		format: "fcpxml",
		title: "Trailer",
		frameRate: FPS_24,
		tracks: [
			{
				type: "video",
				name: "Video 1",
				events: [
					event("A001.mov", "00:00:00:00", "00:00:03:00"),
					event("B002.mov", "00:00:03:00", "00:00:08:00"),
				],
			},
			{
				type: "audio",
				name: "Audio 1",
				events: [event("Music.wav", "00:00:00:00", "00:00:08:00")],
			},
		],
		markers: [marker("Fix the grade", "00:00:01:00"), marker("Too loud", "00:00:02:00", "Red")],
	};
	const markersOf = () =>
		prisma.marker.findMany({
			where: { exportId: w.exp1.id },
			include: { category: true },
			orderBy: { frame: "asc" },
		});

	it("markers only: added as the importer's, in a category per color; the clips stay", async () => {
		await webUpload();
		const member = await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const before = await clipsOf();

		expect(
			await importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: false }),
		).toEqual({
			markers: 2,
			clips: null,
		});
		const markers = await markersOf();
		expect(
			markers.map((m) => [m.name, m.frame, m.category.name, m.category.color, m.authorId]),
		).toEqual([
			["Fix the grade", 24, "Resolve Blue", "#008feb", member.user.id],
			["Too loud", 48, "Resolve Red", "#fc0000", member.user.id],
		]);
		expect(await clipsOf()).toEqual(before);
		expect(fakes.queue).toEqual([]);
	});

	it("the same markers again are skipped, and an existing category is used", async () => {
		await webUpload();
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		await prisma.category.create({
			data: { projectId: w.projectA.id, name: "Resolve Blue", color: "#123456" },
		});
		await importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: false });

		const again = { ...LIST, markers: [...LIST.markers, marker("New", "00:00:03:00")] };
		expect(
			await importCutList({ exportId: w.exp1.id, cutList: again, replaceTracks: false }),
		).toMatchObject({
			markers: 1,
		});
		const markers = await markersOf();
		expect(markers).toHaveLength(3);
		expect(markers[0]!.category.color).toBe("#123456");
	});

	it("replace the timeline: its tracks, its markers, and the shot thumbnails again", async () => {
		await webUpload();
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);

		expect(
			await importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: true }),
		).toEqual({
			markers: 2,
			clips: 2,
		});
		const exp = await prisma.export.findUniqueOrThrow({
			where: { id: w.exp1.id },
			include: { media: true },
		});
		const snap = exp.timelineSnapshot as unknown as TimelineSnapshot;
		expect(snap.metadata.cutsFrom).toBe("fcpxml");
		expect(snap.tracks.map((t) => [t.id, t.clips.map((c) => [c.name, c.startFrameIndex])])).toEqual(
			[
				[
					"V1",
					[
						["A001.mov", 0],
						["B002.mov", 72],
					],
				],
				["A1", [["Music.wav", 0]]],
			],
		);
		expect(exp.cutListKey).toBe(`${exp.mediaId}/cutList`);
		expect(exp.media!.shotThumbnails).toBeNull();
		expect(fakes.queue).toEqual([
			{
				queue: "media-light",
				method: "add",
				args: [
					"shotThumbnails",
					{ mediaId: exp.mediaId, generation: exp.media!.shotThumbnailsGeneration },
					expect.anything(),
				],
			},
		]);
		// estimated cuts can't be changed any more: they are the editing software's now
		await expectStatus(setCutSensitivity({ exportId: w.exp1.id, level: "medium" }), 409);
	});

	it.each([
		["replace with a list without video clips", { ...LIST, tracks: [] }, true, /no video clips/],
		["markers from a list without markers", { ...LIST, markers: [] }, false, /no markers/],
		[
			"a timecode the video's rate doesn't have",
			{ ...LIST, frameRate: null, markers: [marker("x", "00:00:01:25")] },
			false,
			/doesn't fit/,
		],
		[
			"markers outside the video",
			{ ...LIST, markers: [marker("x", "00:00:30:00")] },
			false,
			/No marker/,
		],
	])("400 for %s", async (_, cutList, replaceTracks, message) => {
		await webUpload();
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
		const res = await expectStatus(
			importCutList({ exportId: w.exp1.id, cutList, replaceTracks }),
			400,
		);
		expect(res.body.message).toMatch(message);
		expect(await markersOf()).toEqual([]);
	});

	it("409 for a web upload that is still processed: its frame rate is an estimate", async () => {
		await webUpload(SCORES, "PROCESSING" as "COMPLETED");
		signIn(w.owner.user, w.org.id);
		for (const replaceTracks of [false, true]) {
			await expectStatus(importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks }), 409);
		}
	});

	it("a reviewer may import markers, but not replace the timeline", async () => {
		await webUpload();
		const reviewer = await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);
		await expectStatus(
			importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: true }),
			403,
		);
		expect(
			await importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: false }),
		).toMatchObject({
			markers: 2,
		});
		expect((await markersOf()).every((m) => m.authorId === reviewer.user.id)).toBe(true);
	});

	it("404 without access to the export", async () => {
		await webUpload();
		await signInAs(w.org, MEMBER, [{ timelineId: w.tl2.id }]);
		await expectStatus(
			importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: false }),
			404,
		);
	});

	describe("plugin exports", () => {
		// exp1 as a plugin export: the editing software's timeline, 24 fps from 01:00:00:00, 10 s
		async function pluginExport(status: "PROCESSING" | "COMPLETED" = "PROCESSING") {
			await prisma.export.update({
				where: { id: w.exp1.id },
				data: {
					timelineSnapshot: {
						id: "tl",
						name: "Cut",
						frameRate: FPS_24,
						startFrameIndex: 86400,
						durationFrameCount: 240,
						tracks: [],
						mediaItems: [],
						metadata: {},
					} as never,
					media: { update: { status } },
				},
			});
		}
		const pluginList = (): CutList => ({
			...LIST,
			format: "edl",
			frameRate: null,
			tracks: [],
			markers: [marker("Fix the grade", "01:00:01:00"), marker("Later", "01:00:30:00")],
		});

		it("markers can be imported, also while the video is processed: the timeline is known", async () => {
			await pluginExport();
			await signInAs(w.org, MEMBER, [{ timelineId: w.tl1.id }]);
			expect(
				await importCutList({ exportId: w.exp1.id, cutList: pluginList(), replaceTracks: false }),
			).toEqual({ markers: 1, clips: null });
			expect((await markersOf()).map((m) => [m.name, m.frame])).toEqual([["Fix the grade", 86424]]);
		});

		it("the timeline can't be replaced: it is the editing software's", async () => {
			await pluginExport("COMPLETED");
			signIn(w.owner.user, w.org.id);
			const res = await expectStatus(
				importCutList({ exportId: w.exp1.id, cutList: LIST, replaceTracks: true }),
				409,
			);
			expect(res.body.message).toMatch(/editing software/);
			expect(fakes.queue).toEqual([]);
		});

		it("409 before the plugin sent its timeline", async () => {
			await prisma.export.update({
				where: { id: w.exp1.id },
				data: { timelineSnapshot: Prisma.DbNull },
			});
			signIn(w.owner.user, w.org.id);
			await expectStatus(
				importCutList({ exportId: w.exp1.id, cutList: pluginList(), replaceTracks: false }),
				409,
			);
		});
	});
});
