import { prisma } from "#lib/server/database.ts";
import { requireMediaAccess } from "#lib/server/org-access.ts";
import { hlsInfo } from "@postpin-io/shared/types/HlsIndex";
import { error, type RequestHandler } from "@sveltejs/kit";
import * as v from "valibot";

export const GET: RequestHandler = async ({ params }) => {
	const mediaId = params.media!;
	await requireMediaAccess(mediaId);

	const media = await prisma.media.findUnique({
		where: { id: mediaId },
		select: {
			original: { select: { frameRate: true } },
			proxies: { where: { status: "COMPLETED" } },
		},
	});
	// filter out proxies without hls info (e.g. still processing or failed)
	const renditions = media?.proxies.filter((proxy) => proxy.hls !== null) ?? [];
	if (!media || renditions.length === 0) error(404, "No HLS renditions yet");

	const frameRate = media.original.frameRate;
	const lines = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS"];
	for (const proxy of renditions.sort((a, b) => b.height! - a.height!)) {
		const hls = v.parse(hlsInfo, proxy.hls);
		const peakBandwidth = Math.max(...hls.segments.map((s) => (s.length * 8) / s.duration));
		const averageBandwidth = (Number(proxy.size) * 8) / proxy.duration!;
		lines.push(
			`#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(peakBandwidth)},AVERAGE-BANDWIDTH=${Math.ceil(averageBandwidth)},` +
				`RESOLUTION=${proxy.width}x${proxy.height},CODECS="${proxy.codecs}"` +
				(frameRate ? `,FRAME-RATE=${frameRate.toFixed(3)}` : ""),
			`${proxy.id}.m3u8`,
		);
	}

	return new Response(lines.join("\n") + "\n", {
		headers: {
			"Content-Type": "application/vnd.apple.mpegurl",
			// because of the signed urls in the playlists, dont cache them to avoid expired urls being used
			"Cache-Control": "private, no-store",
		},
	});
};
