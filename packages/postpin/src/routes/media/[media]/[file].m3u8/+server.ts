import * as env from "$app/env/private";
import { prisma } from "#lib/server/database.ts";
import { requireMediaAccess } from "#lib/server/org-access.ts";
import { s3Client } from "#lib/server/storage.ts";
import { getPresignedUrl } from "@postpin-io/shared/storage";
import { hlsInfo } from "@postpin-io/shared/types/HlsIndex";
import { error, type RequestHandler } from "@sveltejs/kit";
import * as v from "valibot";

const URL_LIFETIME_SECONDS = 12 * 60 * 60; // 12 hours

export const GET: RequestHandler = async ({ params }) => {
	const mediaId = params.media!;
	await requireMediaAccess(mediaId);

	const file = await prisma.mediaFile.findFirst({
		where: { id: params.file, proxyOfId: mediaId, status: "COMPLETED" },
		select: { id: true, hls: true },
	});
	if (!file?.hls) error(404, "Rendition not found");

	const hls = v.parse(hlsInfo, file.hls);
	// every segment is a byte range of this one file
	const url = await getPresignedUrl(
		s3Client,
		env,
		{ mediaId, type: "proxy", proxyId: file.id },
		"get",
		URL_LIFETIME_SECONDS,
	);
	const lines = [
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		"#EXT-X-INDEPENDENT-SEGMENTS",
		`#EXT-X-TARGETDURATION:${Math.round(Math.max(...hls.segments.map((s) => s.duration)))}`,
		`#EXT-X-MAP:URI="${url}",BYTERANGE="${hls.init.length}@${hls.init.offset}"`,
	];
	for (const segment of hls.segments) {
		lines.push(
			`#EXTINF:${segment.duration.toFixed(6)},`,
			`#EXT-X-BYTERANGE:${segment.length}@${segment.offset}`,
			url,
		);
	}
	lines.push("#EXT-X-ENDLIST");

	return new Response(lines.join("\n") + "\n", {
		headers: {
			"Content-Type": "application/vnd.apple.mpegurl",
			"Cache-Control": "private, no-store",
		},
	});
};
