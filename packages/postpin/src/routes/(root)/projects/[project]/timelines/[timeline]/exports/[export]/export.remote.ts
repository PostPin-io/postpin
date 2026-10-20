import * as env from "$app/env/private";
import { error } from "@sveltejs/kit";
import { query } from "$app/server";
import { s3Client } from "#lib/server/storage.ts";
import { prisma } from "#lib/server/database.ts";
import { getMediaJobs } from "#lib/server/media.ts";
import * as v from "valibot";
import { getPresignedUrl } from "@postpin-io/shared/storage";

export const getExport = query(
	v.object({ projectId: v.string(), timelineId: v.string(), exportId: v.string() }),
	async ({ projectId, timelineId, exportId }) => {
		const exp = await prisma.export.findFirst({
			where: { id: exportId, timelineId, timeline: { projectId } },
			include: {
				media: {
					include: {
						original: true,
						proxies: true,
						thumbnail: true,
					},
				},
			},
		});
		if (!exp) error(404, "Export not found");

		const media = exp.media && {
			...exp.media,
			jobs:
				exp.media.status === "PROCESSING" || exp.media.status === "FAILED"
					? await getMediaJobs(exp.media.id)
					: [],
		};
		return { ...exp, media };
	},
);

export const getUrl = query(
	v.object({
		mediaId: v.string(),
		type: v.picklist(["original", "proxy", "thumbnail"]),
		proxyId: v.optional(v.string()),
	}),
	async (object) => {
		return await getPresignedUrl(s3Client, env, object);
	},
);
