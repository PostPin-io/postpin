import { WaitingChildrenError } from "bullmq";
import { getQueue, Queues } from "@postpin-io/shared/queue";
import {
	displaySize,
	h264Level,
	proxyTranscodeMessage,
	selectRenditions,
} from "@postpin-io/shared/media/hls";
import { deleteObject, getPresignedUrl } from "@postpin-io/shared/storage";
import type { TypedJob } from "../lib/worker.ts";
import { prisma } from "../lib/database.ts";
import { ffprobe, type ProbeResult } from "../lib/ffmpeg.ts";
import { getOriginalUrl, s3Client } from "../lib/storage.ts";
import { env } from "../lib/env.ts";

/** Renders end on frame boundaries and AAC adds a frame: proxy and original may differ this much */
const DURATION_TOLERANCE_S = 1;

let heavyQueue: ReturnType<typeof getQueue<typeof Queues.heavy>> | null = null;

interface Proxy {
	id: string;
	width: number | null;
	height: number | null;
	size: bigint | null;
	duration: number | null;
	audioCodec: string | null;
}

/**
 * The plugin encoded the proxies and complete-upload checked their playlists against their files.
 * This checks what is in the files: one H.264 High stream at the level of its rendition, in its box
 * and not larger than the original, AAC exactly when the proxy says so, and as long as the original.
 * If one doesn't check out, all of them are replaced by a server transcode, which this job then
 * waits for. Returns the smallest proxy for seekSprites, like a transcode does.
 */
export async function verifyProxies(
	job: TypedJob<typeof Queues.light, "verifyProxies">,
	token?: string,
) {
	const { mediaId } = job.data;
	// second run, after the fallback transcode: its result is ours
	if (job.data.fallback) return transcodeResult(job);

	const proxies = await prisma.mediaFile.findMany({
		where: { proxyOfId: mediaId, status: "COMPLETED" },
		select: { id: true, width: true, height: true, size: true, duration: true, audioCodec: true },
	});
	const original = await ffprobe(await getOriginalUrl(mediaId));
	const problems =
		proxies.length === 0
			? ["no finished proxies"]
			: (await Promise.all(proxies.map((proxy) => checkProxy(mediaId, proxy, original)))).flat();
	if (problems.length === 0) {
		const smallest = proxies.reduce((a, b) => ((b.height ?? 0) < (a.height ?? 0) ? b : a));
		return { proxyId: smallest.id };
	}

	console.warn(
		`[verifyProxies] ${mediaId}: the plugin's proxies don't check out, the server encodes:\n  ` +
			problems.join("\n  "),
	);
	await dropProxies(mediaId, proxies);
	// remembered for the second run, BullMQ starts this job again once the transcode is done
	await job.updateData({ ...job.data, fallback: true });
	heavyQueue ??= getQueue(Queues.heavy, env);
	await heavyQueue.add("transcode", proxyTranscodeMessage(mediaId), {
		parent: { id: job.id!, queue: job.queueQualifiedName },
		failParentOnFailure: true,
	});
	if (await job.moveToWaitingChildren(token!)) throw new WaitingChildrenError();
	// the transcode was done already
	return transcodeResult(job);
}

async function transcodeResult(job: TypedJob<typeof Queues.light, "verifyProxies">) {
	const [child] = Object.values(await job.getChildrenValues()) as { proxyId: string }[];
	if (!child) throw new Error("verifyProxies fell back to a transcode, but it returned nothing");
	return child;
}

/** What doesn't fit, one line per problem; empty when the proxy checks out */
export async function checkProxy(mediaId: string, proxy: Proxy, original: ProbeResult) {
	const name = `${proxy.height}p`;
	const box = { width: proxy.width ?? 0, height: proxy.height ?? 0 };
	const url = await getPresignedUrl(s3Client, env, { mediaId, type: "proxy", proxyId: proxy.id });
	let probe: ProbeResult;
	try {
		probe = await ffprobe(url);
	} catch (error) {
		return [`${name}: ffprobe can't read it (${(error as Error).message})`];
	}
	const problems: string[] = [];
	const expect = (ok: boolean, problem: string) => {
		if (!ok) problems.push(`${name}: ${problem}`);
	};

	const videos = probe.streams.filter((s) => s.codec_type === "video");
	const audios = probe.streams.filter((s) => s.codec_type === "audio");
	expect(videos.length === 1, `${videos.length} video streams`);
	const video = videos[0];
	if (video) {
		const level = Math.round(Number(h264Level(box)) * 10);
		expect(video.codec_name === "h264", `codec ${video.codec_name}`);
		expect(video.profile === "High", `profile ${video.profile}`);
		expect(video.level === level, `level ${video.level}, expected ${level}`);
		expect(video.pix_fmt === "yuv420p", `pixel format ${video.pix_fmt}`);
		expect(
			video.width <= box.width && video.height <= box.height,
			`${video.width}x${video.height} is larger than its ${box.width}x${box.height} box`,
		);
	}
	expect(
		proxy.audioCodec ? audios.length === 1 && audios[0]!.codec_name === "aac" : audios.length === 0,
		`audio ${audios.map((a) => a.codec_name).join(", ") || "none"}, expected ${proxy.audioCodec ?? "none"}`,
	);
	expect(/\bmp4\b/.test(probe.format.format_name), `format ${probe.format.format_name}`);
	expect(
		probe.format.size === undefined || BigInt(probe.format.size) === proxy.size,
		`${probe.format.size} bytes, the upload had ${proxy.size}`,
	);

	const duration = probe.format.duration;
	if (duration !== undefined && proxy.duration !== null) {
		expect(
			Math.abs(duration - proxy.duration) <= DURATION_TOLERANCE_S,
			`lasts ${duration}s, its playlist ${proxy.duration}s`,
		);
	}
	const originalDuration = original.format.duration;
	if (duration !== undefined && originalDuration !== undefined) {
		expect(
			Math.abs(duration - originalDuration) <= DURATION_TOLERANCE_S,
			`lasts ${duration}s, the original ${originalDuration}s`,
		);
	}
	// a plugin picks the renditions by the render's size: never one larger than the original
	const source = original.streams.find((s) => s.codec_type === "video");
	if (source) {
		const size = displaySize({
			width: source.width,
			height: source.height,
			rotation: source.side_data_list?.find((d) => d.rotation !== undefined)?.rotation,
		});
		const allowed = selectRenditions(size).some(
			(r) => r.width === box.width && r.height === box.height,
		);
		expect(allowed, `rendition larger than the ${size.width}x${size.height} original`);
	}
	return problems;
}

/** Deletes the plugin's proxies, files and rows; the transcode creates new ones */
async function dropProxies(mediaId: string, proxies: { id: string }[]) {
	await Promise.allSettled(
		proxies.map(({ id }) => deleteObject(s3Client, env, { mediaId, type: "proxy", proxyId: id })),
	);
	await prisma.mediaFile.deleteMany({ where: { proxyOfId: mediaId } });
}
