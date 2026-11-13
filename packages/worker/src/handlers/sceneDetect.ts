import type { Queues } from "@postpin-io/shared/queue";
import type { Prisma } from "@postpin-io/shared/db";
import { applyCuts, isWebUpload } from "@postpin-io/shared/logic/web-upload";
import type { SceneScores } from "@postpin-io/shared/types/SceneScores";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { ffmpeg } from "../lib/ffmpeg.ts";
import { parseSceneScores, sceneDetectArgs } from "../lib/scene-detect.ts";
import { getOriginalUrl } from "../lib/storage.ts";

/**
 * Web uploads only: finds the cuts in the original. Stores every score, so the sensitivity can be
 * changed later without analysing again, and splits the snapshot into shots at the chosen level.
 * Runs after probe, which settled the frame rate and the length.
 */
export async function sceneDetect(job: TypedJob<typeof Queues.light, "sceneDetect">) {
	const { mediaId } = job.data;
	const exp = await prisma.export.findUniqueOrThrow({
		where: { mediaId },
		select: { id: true, timelineSnapshot: true },
	});
	const snapshot = exp.timelineSnapshot as TimelineSnapshot | null;
	if (!isWebUpload(snapshot)) throw new Error("sceneDetect only works on web uploads");

	const run = ffmpeg(sceneDetectArgs(await getOriginalUrl(mediaId)), (fraction) => {
		void job.updateProgress(fraction);
	});
	const chunks: Buffer[] = [];
	run.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
	await run.done;

	const sceneScores: SceneScores = {
		scores: parseSceneScores(Buffer.concat(chunks).toString(), snapshot.frameRate),
	};
	await prisma.media.update({
		where: { id: mediaId },
		data: { sceneScores: sceneScores as unknown as Prisma.JsonObject },
	});
	const cut = applyCuts(snapshot, sceneScores, snapshot.metadata.cutLevel);
	await prisma.export.update({
		where: { id: exp.id },
		data: { timelineSnapshot: cut as unknown as Prisma.JsonObject },
	});
	console.log(`Found ${cut.tracks[0]?.clips.length ?? 0} shots in ${mediaId} ✅`);
}
