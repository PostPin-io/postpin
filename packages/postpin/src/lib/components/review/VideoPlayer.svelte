<script lang="ts" module>
	import Play from "@lucide/svelte/icons/play";
	import Pause from "@lucide/svelte/icons/pause";
	export const HLS = "application/vnd.apple.mpegurl";

	export type VideoSource = {
		src: string;
		type: typeof HLS | "video/mp4";
	};
</script>

<script lang="ts">
	import { untrack } from "svelte";
	import type { HlsJsVideoElement } from "@videojs/html/media/hlsjs-video";
	import Maximize from "@lucide/svelte/icons/maximize";
	import Volume2 from "@lucide/svelte/icons/volume-2";
	import VolumeX from "@lucide/svelte/icons/volume-x";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import Timecode from "./Timecode.svelte";
	import { seekToMarker } from "./VideoPlayer";
	import {
		frameAtSeconds,
		secondsAtFrame,
		type FrameTiming,
	} from "@postpin-io/shared/logic/timecode";

	let {
		source,
		poster,
		markers,
		timing,
		currentTime = $bindable(0),
		paused = $bindable(true),
		playbackRate = $bindable(1),
		quality = $bindable<number | "auto">("auto"),
	}: {
		source: VideoSource;
		markers: { frame: number }[];
		poster?: string;
		timing: FrameTiming;
		currentTime?: number;
		paused?: boolean;
		playbackRate?: number;
		/** Rendition height to lock to, or "auto" */
		quality?: number | "auto";
	} = $props();

	let element = $state<HTMLElement>();
	/** The element once <hlsjs-video> is defined and set up */
	let media = $state<HlsJsVideoElement>();
	let qualities = $state<number[]>([]);
	let muted = $state(false);

	const fps = $derived(timing.frameRate.fpsNumerator / timing.frameRate.fpsDenominator);
	// Absolute timeline frame, like marker frames
	const frame = $derived(frameAtSeconds(currentTime, timing));

	// A seek in flight owns currentTime until it lands; timeupdates from the old position would undo it
	let seeking = false;
	let seekTarget = 0;
	let seekId = 0;

	let reloads = $state(0);
	let recentReloads: number[] = [];

	function once(target: EventTarget, type: string, timeoutMs = 10_000) {
		return new Promise<void>((resolve) => {
			const done = () => {
				clearTimeout(timer);
				target.removeEventListener(type, done);
				resolve();
			};
			const timer = setTimeout(done, timeoutMs);
			target.addEventListener(type, done);
		});
	}

	function isBuffered(ranges: TimeRanges, time: number) {
		for (let i = 0; i < ranges.length; i++) {
			if (time >= ranges.start(i) && time < ranges.end(i)) return true;
		}
		return false;
	}

	async function seekTo(time: number) {
		const el = media;
		if (!el) return;
		const id = ++seekId;
		seeking = true;
		seekTarget = time;
		// hls.js loads the next segment for a cold seek to the last frames before a segment boundary, so the wrong
		// frame shows. Seeking a little earlier first loads the right segment.
		if (time > 0.1 && !isBuffered(el.buffered, time)) {
			const preSeeked = once(el, "seeked");
			el.currentTime = time - 0.1;
			await preSeeked;
			if (id !== seekId) return;
		}
		const seeked = once(el, "seeked");
		el.currentTime = time;
		await seeked;
		if (id === seekId) seeking = false;
	}

	function updateQualities() {
		const renditions = media?.videoRenditions;
		const heights: number[] = [];
		for (let i = 0; i < (renditions?.length ?? 0); i++) {
			const height = renditions![i]!.height;
			if (height && !heights.includes(height)) heights.push(height);
		}
		qualities = heights.sort((a, b) => b - a);
	}

	function onError() {
		// Expired signed URLs surface as network errors; loading the playlist again signs them anew.
		// An original that can't play won't get better by reloading it.
		if (source.type !== HLS) return;
		const now = Date.now();
		recentReloads = recentReloads.filter((time) => now - time < 60_000);
		if (recentReloads.length >= 3) return;
		recentReloads.push(now);
		reloads++;
	}

	function seekToAdjacentMarker(direction: -1 | 1) {
		const markerFrame = seekToMarker(direction, { markers, playHeadPosition: frame });
		if (markerFrame !== undefined) currentTime = secondsAtFrame(markerFrame, timing);
	}

	const seekToNextMarker = () => seekToAdjacentMarker(1);
	const seekToPreviousMarker = () => seekToAdjacentMarker(-1);

	$effect(() => {
		const host = element;
		if (!host) return;
		let el: HlsJsVideoElement | undefined;
		let frame = 0;
		let disposed = false;
		// Registers <hlsjs-video>; importing it only in the browser keeps it out of SSR
		void import("@videojs/html/media/hlsjs-video").then(async () => {
			await customElements.whenDefined("hlsjs-video");
			if (disposed) return;
			// Listeners go on after the upgrade: the element only forwards media events it was asked for as itself
			const video = host as HlsJsVideoElement;
			const syncTime = () => {
				if (!seeking) currentTime = video.currentTime;
			};
			// timeupdate fires only a few times a second; follow every frame while playing so the playhead moves smoothly
			const followPlayback = () => {
				syncTime();
				if (!video.paused) frame = requestAnimationFrame(followPlayback);
			};
			video.addEventListener("timeupdate", syncTime);
			video.addEventListener("play", () => {
				paused = false;
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(followPlayback);
			});
			video.addEventListener("pause", () => {
				paused = true;
				syncTime();
			});
			video.addEventListener("ratechange", () => (playbackRate = video.playbackRate));
			video.addEventListener("volumechange", () => (muted = video.muted));
			video.addEventListener("loadedmetadata", () => {
				updateQualities();
				video.videoRenditions?.addEventListener("addrendition", updateQualities);
			});
			video.addEventListener("error", onError);
			el = video;
			media = video;
		});
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			el?.pause();
			media = undefined;
		};
	});

	// Only a different URL or type reloads; the page hands in a new but equal object on every poll
	const sourceKey = $derived(`${source.type} ${source.src}`);

	$effect(() => {
		const el = media;
		if (!el) return;
		void sourceKey;
		const attempt = reloads;
		const { src, type } = untrack(() => source);
		const resumeAt = untrack(() => currentTime);
		el.addEventListener("loadedmetadata", () => void seekTo(resumeAt), { once: true });
		if (type === HLS) {
			// a changed URL makes the element fetch the playlists again, with freshly signed URLs
			const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}reload=${attempt}` : src;
			el.source = { src: url, type, preferPlayback: "mse" };
		} else {
			el.source = { src, type };
		}
	});

	$effect(() => {
		const time = currentTime;
		const el = media;
		if (!el) return;
		const shown = seeking ? seekTarget : el.currentTime;
		if (Math.abs(shown - time) > 0.5 / fps) void seekTo(time);
	});

	$effect(() => {
		const el = media;
		if (!el) return;
		if (paused && !el.paused) el.pause();
		else if (!paused && el.paused) el.play().catch(() => (paused = true));
	});

	$effect(() => {
		if (media && media.playbackRate !== playbackRate) media.playbackRate = playbackRate;
	});

	$effect(() => {
		if (media) media.poster = poster ?? "";
	});

	$effect(() => {
		const renditions = media?.videoRenditions;
		const selected = quality;
		void qualities; // the renditions only appear once the playlist has loaded
		if (!renditions?.length) return;
		let index = -1; // -1 lets hls.js choose
		if (selected !== "auto") {
			for (let i = 0; i < renditions.length; i++) {
				if (renditions[i]!.height === selected) index = i;
			}
		}
		if (renditions.selectedIndex !== index) renditions.selectedIndex = index;
	});
</script>

<div class="group relative flex h-full w-full flex-col">
	<div class="relative min-h-0 flex-1">
		<hlsjs-video bind:this={element} playsinline class="absolute inset-0 block"></hlsjs-video>
	</div>

	<div class="grid w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 border-t-1 p-1">
		<div class="flex items-center gap-2 justify-self-start">
			<Timecode
				bind:frame={() => frame, (f) => (currentTime = secondsAtFrame(f, timing))}
				frameRate={timing.frameRate}
				startFrame={timing.startFrameIndex}
				editable={true}
			/>
			<span class="font-mono">|</span>
			<span class="font-mono"> {playbackRate}×</span>
		</div>

		<div class="flex items-center justify-center">
			<button
				class="btn btn-square btn-ghost btn-xs"
				title="Jump to previous Marker on the left"
				onclick={() => seekToPreviousMarker()}
			>
				<ArrowLeft size={16} />
			</button>

			<button
				class="btn btn-square btn-ghost btn-xs"
				aria-label={paused ? "Play" : "Pause"}
				onclick={() => (paused = !paused)}
			>
				{#if paused}
					<Play size={16} />
				{:else}
					<Pause size={16} />
				{/if}
			</button>

			<button
				class="btn btn-square btn-ghost btn-xs"
				title="Jump to next Marker on the right"
				onclick={() => seekToNextMarker()}
			>
				<ArrowRight size={16} />
			</button>
		</div>

		<div class="flex items-center gap-1 justify-self-end">
			{#if qualities.length > 0}
				<select class="select w-24 select-xs" bind:value={quality} aria-label="Quality">
					<option value="auto">Auto</option>
					{#each qualities as height (height)}
						<option value={height}>{height}p</option>
					{/each}
				</select>
			{/if}
			<button
				class="btn btn-square btn-ghost btn-xs"
				aria-label={muted ? "Unmute" : "Mute"}
				onclick={() => media && (media.muted = !media.muted)}
			>
				{#if muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}
			</button>
			<button
				class="btn btn-square btn-ghost btn-xs"
				aria-label="Fullscreen"
				onclick={() => void media?.requestFullscreen()}
			>
				<Maximize size={16} />
			</button>
		</div>
	</div>
</div>
