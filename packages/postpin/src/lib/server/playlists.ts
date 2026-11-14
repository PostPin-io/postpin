import * as env from "$app/env/private";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { MAX_URL_LIFETIME_SECONDS } from "@postpin-io/shared/logic/share-links";
import { getPresignedUrl } from "@postpin-io/shared/storage";
import { hlsInfo } from "@postpin-io/shared/types/HlsIndex";
import { prisma } from "#lib/server/database.ts";
import { s3PresignClient } from "#lib/server/storage.ts";

const headers = {
	"Content-Type": "application/vnd.apple.mpegurl",
	// because of the signed urls in the playlists, dont cache them to avoid expired urls being used
	"Cache-Control": "private, no-store",
};

/** By height; the id breaks ties, so "the lowest rendition" is the same one on every request */
const largestFirst = (a: { id: string; height: number | null }, b: typeof a) =>
	b.height! - a.height! || a.id.localeCompare(b.id);

/**
 * Master playlist of all finished renditions, linked relatively (`<id>.m3u8`).
 * `renditionQuery` is appended to each of those URIs, since relative URIs drop the
 * playlist's own query string (guests: `?share=<token>`). Callers check access first.
 * `lowestOnly`: just the smallest rendition (screening guests, see isLowestRendition).
 */
export async function masterPlaylist(mediaId: string, renditionQuery = "", lowestOnly = false) {
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
	renditions.sort(largestFirst);
	for (const proxy of lowestOnly ? renditions.slice(-1) : renditions) {
		const hls = v.parse(hlsInfo, proxy.hls);
		const peakBandwidth = Math.max(...hls.segments.map((s) => (s.length * 8) / s.duration));
		const averageBandwidth = (Number(proxy.size) * 8) / proxy.duration!;
		lines.push(
			`#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(peakBandwidth)},AVERAGE-BANDWIDTH=${Math.ceil(averageBandwidth)},` +
				`RESOLUTION=${proxy.width}x${proxy.height},CODECS="${proxy.codecs}"` +
				(frameRate ? `,FRAME-RATE=${frameRate.toFixed(3)}` : ""),
			`${proxy.id}.m3u8${renditionQuery}`,
		);
	}
	return new Response(lines.join("\n") + "\n", { headers });
}

/**
 * Screening guests only get the smallest rendition: a room full of phones on one Wi-Fi, and
 * the video is there to navigate, not to judge the picture. Same choice as masterPlaylist's.
 */
export async function isLowestRendition(mediaId: string, fileId: string) {
	const proxies = await prisma.mediaFile.findMany({
		where: { proxyOfId: mediaId, status: "COMPLETED" },
		select: { id: true, height: true, hls: true },
	});
	const lowest = proxies
		.filter((proxy) => proxy.hls !== null)
		.sort(largestFirst)
		.at(-1);
	return lowest?.id === fileId;
}

/**
 * Playlist of one rendition: byte ranges in one presigned proxy file.
 * 404 unless `fileId` is a finished proxy *of `mediaId`*, so a foreign file id gets nothing.
 */
export async function renditionPlaylist(
	mediaId: string,
	fileId: string,
	lifetimeSeconds = MAX_URL_LIFETIME_SECONDS,
) {
	const file = await prisma.mediaFile.findFirst({
		where: { id: fileId, proxyOfId: mediaId, status: "COMPLETED" },
		select: { id: true, hls: true },
	});
	if (!file?.hls) error(404, "Rendition not found");

	const hls = v.parse(hlsInfo, file.hls);
	// every segment is a byte range of this one file
	const url = await getPresignedUrl(
		s3PresignClient,
		env,
		{ mediaId, type: "proxy", proxyId: file.id },
		"get",
		lifetimeSeconds,
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
	return new Response(lines.join("\n") + "\n", { headers });
}
