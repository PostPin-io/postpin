import { secondsAtFrame, type FrameTiming } from "@postpin-io/shared/logic/timecode";
import { HLS, type VideoSource } from "../../VideoPlayer.svelte";
import { once, seekVideo } from "../../video-seek.ts";
import type { ReviewMarker } from "../types.ts";
import { drawPointers } from "./draw-pointers.ts";

export interface Thumbnail {
	/** JPEG */
	dataUrl: string;
	width: number;
	height: number;
}

export interface FrameGrabber {
	/** The marker's first frame with its pointers on it */
	grab(marker: Pick<ReviewMarker, "frame" | "pointers">): Promise<Thumbnail>;
	close(): void;
}

/**
 * Grabs frames in the browser with a video of its own, so the review's player keeps its position.
 * Grab one frame at a time: there is only one video.
 */
export async function openFrameGrabber(
	source: VideoSource,
	timing: FrameTiming,
	grabWidth: number,
): Promise<FrameGrabber> {
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.preload = "auto";
	// Segments and the original come from the bucket: without CORS the canvas can't be read
	video.crossOrigin = "anonymous";
	// Some browsers don't decode frames for a video that isn't in the document
	Object.assign(video.style, {
		position: "fixed",
		left: "0",
		top: "0",
		width: "1px",
		height: "1px",
		opacity: "0",
		pointerEvents: "none",
	});
	document.body.append(video);

	let hls: import("hls.js").default | undefined;
	const failed = new Promise<never>((_, reject) => {
		video.addEventListener("error", () => reject(new Error("The video could not be loaded")), {
			once: true,
		});
	});

	const close = () => {
		hls?.destroy();
		video.removeAttribute("src");
		video.load();
		video.remove();
	};

	try {
		if (source.type === HLS) {
			const { default: Hls } = await import("hls.js");
			if (Hls.isSupported()) {
				const player = new Hls({ capLevelToPlayerSize: false, maxBufferLength: 4 });
				hls = player;
				player.on(Hls.Events.MANIFEST_PARSED, (_event, { levels }) => {
					// The smallest rendition at least as wide as the thumbnail
					const byWidth = levels
						.map((level, index) => ({ index, width: level.width }))
						.sort((a, b) => a.width - b.width);
					const level = byWidth.find((l) => l.width >= grabWidth) ?? byWidth.at(-1);
					if (level) player.currentLevel = level.index;
				});
				const fatal = new Promise<never>((_, reject) => {
					player.on(Hls.Events.ERROR, (_event, data) => {
						if (data.fatal) reject(new Error(`The video could not be loaded (${data.details})`));
					});
				});
				player.loadSource(source.src);
				player.attachMedia(video);
				await Promise.race([once(video, "loadeddata", 30_000), failed, fatal]);
			} else {
				// Safari plays HLS itself
				video.src = source.src;
				await Promise.race([once(video, "loadeddata", 30_000), failed]);
			}
		} else {
			video.src = source.src;
			await Promise.race([once(video, "loadeddata", 30_000), failed]);
		}
		if (!video.videoWidth) throw new Error("The video could not be loaded");
	} catch (error) {
		close();
		throw error;
	}

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d")!;

	return {
		async grab(marker) {
			await seekVideo(video, secondsAtFrame(marker.frame, timing));
			await nextFrame(video);
			const width = grabWidth;
			const height = Math.round((grabWidth * video.videoHeight) / video.videoWidth);
			canvas.width = width;
			canvas.height = height;
			ctx.drawImage(video, 0, 0, width, height);
			drawPointers(ctx, marker.pointers, { width, height });
			return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width, height };
		},
		close,
	};
}

/** Chrome with MSE can report "seeked" before the frame is decoded */
function nextFrame(video: HTMLVideoElement) {
	if (!("requestVideoFrameCallback" in video)) return Promise.resolve();
	return Promise.race([
		new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())),
		new Promise<void>((resolve) => setTimeout(resolve, 250)),
	]);
}
