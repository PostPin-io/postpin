import type { Queues } from "@postpin-io/shared/queue";
import type { Prisma } from "@postpin-io/shared/db";
import * as v from "valibot";
import { CutListError, cutListSchema } from "@postpin-io/shared/logic/cut-list";
import { applyCutList, isWebUpload } from "@postpin-io/shared/logic/web-upload";
import { getTextObject } from "@postpin-io/shared/storage";
import { saveCutListMarkers } from "@postpin-io/shared/db/cut-list-markers";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { env } from "../lib/env.ts";
import { s3Client } from "../lib/storage.ts";

/**
 * Web uploads with a cut list (the editing software's tracks and markers, from an EDL or FCPXML):
 * the tracks become the snapshot's, the markers PostPin markers of the uploader, in a category per
 * color like the plugins make them ("Resolve Blue"). Runs after probe (and the cut detection), so
 * the frame rate is the timeline's: the file's, unless the uploader set one, and the length is
 * known.
 *
 * A list that doesn't fit (another frame rate, another video) is no reason to fail the
 * processing: the reason is stored on the export for the review page, and the tracks stay as
 * they were, estimated by the cut detection if it ran. Storage errors fail the job as usual.
 */
export async function cutList(job: TypedJob<typeof Queues.light, "cutList">) {
	const { mediaId } = job.data;
	const exp = await prisma.export.findUniqueOrThrow({
		where: { mediaId },
		select: {
			id: true,
			timelineSnapshot: true,
			cutListKey: true,
			uploadedById: true,
			timeline: { select: { projectId: true } },
		},
	});
	const snapshot = exp.timelineSnapshot as TimelineSnapshot | null;
	if (!isWebUpload(snapshot)) throw new Error("cutList only works on web uploads");
	if (!exp.cutListKey) throw new Error(`Export ${exp.id} has no cut list`);

	// checked when it was uploaded; parsed again because it comes from storage
	const list = v.parse(
		cutListSchema,
		JSON.parse(await getTextObject(s3Client, env, exp.cutListKey)),
	);
	let applied: ReturnType<typeof applyCutList>;
	try {
		applied = applyCutList(snapshot, list);
	} catch (e) {
		if (!(e instanceof CutListError)) throw e;
		await prisma.export.update({ where: { id: exp.id }, data: { cutListError: e.message } });
		console.log(`Cut list of ${mediaId} not used: ${e.message}`);
		return { tracks: null, markers: null, error: e.message };
	}

	const { snapshot: updated, markers } = applied;
	const count = await saveCutListMarkers(prisma, {
		exportId: exp.id,
		projectId: exp.timeline.projectId,
		authorId: exp.uploadedById,
		format: list.format,
		markers,
	});
	await prisma.export.update({
		where: { id: exp.id },
		data: { timelineSnapshot: updated as unknown as Prisma.JsonObject, cutListError: null },
	});
	console.log(
		`${updated.tracks.length} tracks and ${count} markers of ${mediaId} from its ${list.format} ✅`,
	);
	return { tracks: updated.tracks.length, markers: count, error: null };
}
