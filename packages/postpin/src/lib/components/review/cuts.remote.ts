// The cuts of a web upload: estimated (see @postpin-io/shared/logic/web-upload), or from the
// editing software's timeline data imported later (see @postpin-io/shared/logic/cut-list)
import { command } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { prisma } from "#lib/server/database.ts";
import { renderShotThumbnails } from "#lib/server/media.ts";
import { s3Client } from "#lib/server/storage.ts";
import * as env from "$app/env/private";
import { getCategories, getMarkers } from "./markers/markers.remote.ts";
import { markersKey } from "./markers/marker-scope.ts";
import { saveCutListMarkers } from "@postpin-io/shared/db/cut-list-markers";
import {
	checkCutList,
	CutListError,
	cutListSchema,
	hasVideoClips,
} from "@postpin-io/shared/logic/cut-list";
import { putTextObject } from "@postpin-io/shared/storage";
import { authorize } from "#lib/server/org-access.ts";
import { Prisma } from "@postpin-io/shared/db";
import {
	applyCutList,
	applyCuts,
	cutLevel,
	isWebUpload,
} from "@postpin-io/shared/logic/web-upload";
import { sceneScores } from "@postpin-io/shared/types/SceneScores";
import { newShotThumbnailsGeneration } from "@postpin-io/shared/types/ShotThumbnails";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";

/**
 * Builds the shots of a web upload again for another sensitivity, from the scores the cut
 * detection stored, and renders their thumbnails again. No new analysis of the video needed.
 */
export const setCutSensitivity = command(
	v.object({ exportId: v.string(), level: cutLevel }),
	async ({ exportId, level }) => {
		// changes what everyone sees of the export, like uploading a new version would
		await authorize("export", "upload", { type: "export", id: exportId });
		const exp = await prisma.export.findUnique({
			where: { id: exportId },
			select: {
				timelineSnapshot: true,
				media: { select: { id: true, status: true, sceneScores: true } },
			},
		});
		const snapshot = exp?.timelineSnapshot as TimelineSnapshot | null | undefined;
		if (!exp?.media || !isWebUpload(snapshot)) error(409, "Only web uploads have estimated cuts");
		if (snapshot.metadata.cutsFrom)
			error(409, "The cuts come from the editing software's timeline");
		if (exp.media.status !== "COMPLETED") error(409, "The video is still being processed");

		const scores = exp.media.sceneScores ? v.parse(sceneScores, exp.media.sceneScores) : null;
		if (!scores && level !== "none") error(409, "The cuts of this video weren't detected");

		const updated = applyCuts(snapshot, scores, level);
		// One update for the shots and their generation: a render of older shots that is still
		// running sees it was overtaken and doesn't publish (see the worker's shotThumbnails)
		const generation = newShotThumbnailsGeneration();
		await prisma.export.update({
			where: { id: exportId },
			data: {
				timelineSnapshot: updated as unknown as Prisma.JsonObject,
				media: {
					update: {
						// the old thumbnails belong to the old shots; the job sets this again
						shotThumbnails: Prisma.DbNull,
						shotThumbnailsGeneration: generation,
					},
				},
			},
		});
		await renderShotThumbnails(exp.media.id, generation);
		return { shotCount: updated.tracks[0]?.clips.length ?? 0 };
	},
);

/**
 * Imports timeline data (an EDL or FCPXML, read in the browser into a cut list) into a processed
 * web upload: its markers always, as markers of the importer in a category per color; with
 * `replaceTracks` also its tracks, which replace the timeline (estimated or from an earlier list),
 * and the shot thumbnails are rendered again. Markers that are there already are skipped.
 */
export const importCutList = command(
	v.object({ exportId: v.string(), cutList: cutListSchema, replaceTracks: v.boolean() }),
	async ({ exportId, cutList, replaceTracks }) => {
		// changes what everyone sees of the export, like uploading a new version would
		const { member } = await authorize("export", "upload", { type: "export", id: exportId });
		const exp = await prisma.export.findUnique({
			where: { id: exportId },
			select: {
				timelineSnapshot: true,
				timeline: { select: { projectId: true } },
				media: { select: { id: true, status: true } },
			},
		});
		const snapshot = exp?.timelineSnapshot as TimelineSnapshot | null | undefined;
		if (!exp?.media || !isWebUpload(snapshot)) {
			error(409, "Only web uploads can import timeline data");
		}
		if (exp.media.status !== "COMPLETED") error(409, "The video is still being processed");
		if (replaceTracks && !hasVideoClips(cutList)) {
			error(400, "The file has no video clips to replace the timeline with");
		}
		if (!replaceTracks && cutList.markers.length === 0) error(400, "The file has no markers");

		// markers only: the tracks of the list play no part
		const list = replaceTracks ? cutList : { ...cutList, tracks: [] };
		let applied: ReturnType<typeof applyCutList>;
		try {
			checkCutList(list);
			applied = applyCutList(snapshot, list);
		} catch (e) {
			if (e instanceof CutListError) error(400, e.message);
			throw e;
		}

		const added = await saveCutListMarkers(prisma, {
			exportId,
			projectId: exp.timeline.projectId,
			authorId: member.userId,
			markers: applied.markers,
		});
		if (replaceTracks) {
			const key = await putTextObject(
				s3Client,
				env,
				{ mediaId: exp.media.id, type: "cutList" },
				JSON.stringify(cutList),
				"application/json",
			);
			// one update for the tracks and their generation, see setCutSensitivity
			const generation = newShotThumbnailsGeneration();
			await prisma.export.update({
				where: { id: exportId },
				data: {
					timelineSnapshot: applied.snapshot as unknown as Prisma.JsonObject,
					cutListKey: key,
					cutListError: null,
					media: {
						update: { shotThumbnails: Prisma.DbNull, shotThumbnailsGeneration: generation },
					},
				},
			});
			await renderShotThumbnails(exp.media.id, generation);
		}
		if (added > 0) {
			await Promise.all([
				getMarkers(markersKey(exportId)).refresh(),
				getCategories(exp.timeline.projectId).refresh(),
			]);
		}
		return {
			markers: added,
			clips: replaceTracks
				? applied.snapshot.tracks
						.filter((t) => t.type === "video")
						.reduce((n, t) => n + t.clips.length, 0)
				: null,
		};
	},
);
