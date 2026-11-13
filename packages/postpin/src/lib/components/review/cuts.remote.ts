// The estimated cuts of a web upload, see @postpin-io/shared/logic/web-upload
import { command } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { prisma } from "#lib/server/database.ts";
import { renderShotThumbnails } from "#lib/server/media.ts";
import { authorize } from "#lib/server/org-access.ts";
import { Prisma } from "@postpin-io/shared/db";
import { applyCuts, cutLevel, isWebUpload } from "@postpin-io/shared/logic/web-upload";
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
