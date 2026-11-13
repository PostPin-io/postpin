// Uploading a video from the browser, with the signed-in session. The plugins use the REST API
// (ExportController) instead; both go through #lib/server/export-upload.ts.
import { command, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { prisma } from "#lib/server/database.ts";
import {
	abortUpload,
	attachCutList,
	completeUpload,
	createExport,
	initUpload,
	resumeUpload,
	uploadLimits,
} from "#lib/server/export-upload.ts";
import { authorize } from "#lib/server/org-access.ts";
import { cutListSchema } from "@postpin-io/shared/logic/cut-list";
import { framesPerDay } from "@postpin-io/shared/logic/timecode";
import {
	cutLevel,
	isFrameRateOption,
	USER_SET_FIELDS,
	webUploadSnapshot,
} from "@postpin-io/shared/logic/web-upload";

const id = v.pipe(v.string(), v.minLength(1));
const exportName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100));

export const createWebExport = command(
	v.object({ projectId: id, timelineId: id, name: exportName }),
	async (data) => await createExport(data),
);

export const initWebUpload = command(
	v.object({ exportId: id, fileSize: v.number() }),
	async (data) => await initUpload(data),
);

const frameRate = v.pipe(
	v.object({
		fpsNumerator: v.pipe(v.number(), v.integer()),
		fpsDenominator: v.pipe(v.number(), v.integer()),
		dropFrame: v.boolean(),
	}),
	v.check(isFrameRateOption, "Unsupported frame rate"),
);

/** What the upload form knows about the file. null: unknown (MXF), the worker reads it. */
const uploadForm = v.object({
	fileName: v.pipe(v.string(), v.maxLength(255)),
	frameRate: v.nullable(frameRate),
	startFrameIndex: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	durationFrameCount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	/** Fields the uploader changed; the worker keeps those */
	userSet: v.array(v.picklist(USER_SET_FIELDS)),
	cutLevel,
});

export type UploadForm = v.InferOutput<typeof uploadForm>;

/** Until probe knows better (MXF): an arbitrary rate, it's replaced */
const PLACEHOLDER_RATE = { fpsNumerator: 25, fpsDenominator: 1, dropFrame: false };

export const completeWebUpload = command(
	v.object({
		exportId: id,
		uploadId: id,
		parts: v.pipe(
			v.array(v.object({ partNumber: v.pipe(v.number(), v.integer()), etag: v.string() })),
			v.maxLength(10000),
		),
		form: uploadForm,
	}),
	async ({ exportId, uploadId, parts, form }) => {
		await authorize("export", "upload", { type: "export", id: exportId });
		const rate = form.frameRate ?? PLACEHOLDER_RATE;
		const start = form.startFrameIndex ?? 0;
		if (start >= framesPerDay(rate))
			error(400, "The start timecode doesn't exist at this frame rate");

		const exp = await prisma.export.findUnique({ where: { id: exportId }, select: { name: true } });
		const timelineSnapshot = webUploadSnapshot({
			id: exportId,
			name: exp?.name ?? form.fileName,
			fileName: form.fileName,
			timing: {
				frameRate: rate,
				startFrameIndex: start,
				durationFrameCount: form.durationFrameCount ?? 0,
			},
			// a value only counts as the uploader's when they filled it in
			userSet: form.userSet.filter((f) =>
				f === "frameRate" ? form.frameRate !== null : form.startFrameIndex !== null,
			),
			cutLevel: form.cutLevel,
		});
		await completeUpload({
			exportId,
			uploadId,
			parts,
			timelineSnapshot,
			processing: { webUpload: true, detectCuts: form.cutLevel !== "none" },
		});
	},
);

/** The tracks of the video's timeline (EDL, FCPXML), sent after init and before the parts */
export const attachWebUploadCutList = command(
	v.object({ exportId: id, cutList: cutListSchema }),
	async (data) => await attachCutList(data),
);

export const abortWebUpload = command(
	v.object({ exportId: id, uploadId: id }),
	async (data) => await abortUpload(data),
);

export const resumeWebUpload = command(
	v.object({ exportId: id, uploadId: id }),
	async (data) => await resumeUpload(data),
);

/** For the checks before uploading: the size limit and the space left, in bytes (null = no limit) */
export const getUploadLimits = query(id, async (timelineId) => {
	const { member } = await authorize("export", "upload", { type: "timeline", id: timelineId });
	return await uploadLimits(member);
});
