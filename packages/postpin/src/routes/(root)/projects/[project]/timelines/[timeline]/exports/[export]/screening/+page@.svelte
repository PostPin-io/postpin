<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { getExport } from "#lib/components/review/export-view.remote.ts";
	import VideoPlayer, { HLS } from "#lib/components/review/VideoPlayer.svelte";
	import ScreeningControls from "#lib/components/screening/ScreeningControls.svelte";
	import ScreeningSlate from "#lib/components/screening/ScreeningSlate.svelte";
	import {
		SCREENING_AWAY_TIMEOUT_MS,
		screeningChannelName,
		type FromScreeningWindow,
		type ToScreeningWindow,
	} from "#lib/components/screening/screening-protocol.ts";
	import { isPlainKey } from "#lib/keyboard.ts";
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";

	// The presentation window of a screening: only the video, for the projector. The export view
	// that opened it controls it (screening-protocol.ts); on its own this page plays nothing.
	// Access: getExport checks the member like on the export view.

	const sessionId = $derived(page.url.searchParams.get("session"));
	const exportQuery = $derived(
		getExport({
			projectId: page.params.project!,
			timelineId: page.params.timeline!,
			exportId: page.params.export!,
		}),
	);
	const exp = $derived(exportQuery.current);
	const snapshot = $derived(exp?.timelineSnapshot as TimelineSnapshot | undefined);
	const hlsReady = $derived(
		exp?.media?.proxies.some((proxy) => proxy.status === "COMPLETED" && proxy.hasHls) ?? false,
	);

	// The player state: set by the export view's messages, changed by the video itself
	// (playback moves the time, the end pauses), and reported back
	let time = $state(0);
	let paused = $state(true);
	let rate = $state(1);
	let muted = $state(false);
	let quality = $state<number | "auto">("auto");
	let qr = $state(false);
	let qualities = $state<number[]>([]);
	let fullscreen = $state(false);
	/** Reactive, so every message is answered, even one that changes nothing */
	let rev = $state(0);

	let shareUrl = $state("");
	let connected = $state(false);
	// Nobody answered: opened by hand, or the export view is gone
	let orphaned = $state(false);
	let activated = $state(true);
	let channel = $state<BroadcastChannel>();
	let player = $state<VideoPlayer>();

	const readActivation = () => (activated = navigator.userActivation?.hasBeenActive ?? true);

	function sendStatus() {
		if (!connected || !channel) return;
		channel.postMessage({
			type: "status",
			rev,
			state: { time, paused, rate, muted, quality, qr },
			qualities: $state.snapshot(qualities),
			activated,
			fullscreen,
		} satisfies FromScreeningWindow);
	}

	onMount(() => {
		readActivation();
		if (!sessionId) {
			orphaned = true;
			return;
		}
		const ch = new BroadcastChannel(screeningChannelName(sessionId));
		// The export view said it is going away: a reload asks to resume soon, anything else
		// (closed tab, another site) leaves this window without anyone to control it
		let awayTimer: ReturnType<typeof setTimeout> | undefined;
		ch.onmessage = ({ data }: MessageEvent<ToScreeningWindow>) => {
			if (data.type === "close") return window.close();
			if (data.type === "away") {
				clearTimeout(awayTimer);
				awayTimer = setTimeout(() => window.close(), SCREENING_AWAY_TIMEOUT_MS);
				return;
			}
			clearTimeout(awayTimer);
			// The reloaded view takes over where this window is
			if (data.type === "resume") return sendStatus();
			if (data.type === "init") {
				({ time, paused, rate, muted, quality, qr } = data.state);
				shareUrl = data.shareUrl;
				connected = true;
				orphaned = false;
			} else {
				if (data.patch.time !== undefined) time = data.patch.time;
				if (data.patch.paused !== undefined) paused = data.patch.paused;
				if (data.patch.rate !== undefined) rate = data.patch.rate;
				if (data.patch.muted !== undefined) muted = data.patch.muted;
				if (data.patch.quality !== undefined) quality = data.patch.quality;
				if (data.patch.qr !== undefined) qr = data.patch.qr;
			}
			rev = data.rev;
		};
		channel = ch;

		const hello = () => {
			if (!connected) ch.postMessage({ type: "hello" } satisfies FromScreeningWindow);
		};
		hello();
		const helloTimer = setInterval(hello, 500);
		const orphanTimer = setTimeout(() => (orphaned = !connected), 5000);
		// The export view closes this window when it goes; this catches the cases where it couldn't
		const openerTimer = setInterval(() => {
			if (window.opener && (window.opener as Window).closed) window.close();
		}, 2000);
		// Closed or reloaded: the view waits a moment for a new hello before it gives up
		const bye = () => ch.postMessage({ type: "bye" } satisfies FromScreeningWindow);
		window.addEventListener("pagehide", bye);
		return () => {
			clearInterval(helloTimer);
			clearTimeout(orphanTimer);
			clearTimeout(awayTimer);
			clearInterval(openerTimer);
			window.removeEventListener("pagehide", bye);
			ch.close();
			channel = undefined;
		};
	});

	// Every change is reported (sendStatus reads all of the state)
	$effect(sendStatus);

	const fps = $derived(
		snapshot ? snapshot.frameRate.fpsNumerator / snapshot.frameRate.fpsDenominator : 25,
	);
	// The QR code stands before the first frame: there until playback starts, and again at the start
	const slateVisible = $derived(qr || (paused && time < 0.5 / fps));

	// The controls show while the mouse moves, like any player's
	let chromeVisible = $state(true);
	let chromeTimer: ReturnType<typeof setTimeout> | undefined;
	function wakeChrome() {
		chromeVisible = true;
		clearTimeout(chromeTimer);
		chromeTimer = setTimeout(() => (chromeVisible = false), 2500);
	}
	onMount(() => {
		wakeChrome();
		return () => clearTimeout(chromeTimer);
	});

	function onkeydown(event: KeyboardEvent) {
		readActivation();
		if (event.defaultPrevented || event.repeat || !isPlainKey(event)) return;
		if (event.key === "f" || event.key === "F") player?.toggleFullscreen();
		else if (event.key === " ") {
			paused = !paused;
			if (paused) rate = 1;
		} else return;
		event.preventDefault();
	}
</script>

<PageMeta title={exp ? `Screening: ${exp.name}` : "Screening"} />

<svelte:window {onkeydown} onpointerdown={readActivation} onpointermove={wakeChrome} />

<div class="h-dvh w-full overflow-hidden bg-black text-white">
	{#if exportQuery.error}
		{@render message(
			"This export can't be shown.",
			"Close this window and start the screening again.",
		)}
	{:else if orphaned}
		{@render message(
			"No screening is running here.",
			"Start one in the export view with the projector button; this window opens from there.",
		)}
	{:else if !exp || !connected}
		<div class="flex h-full items-center justify-center" role="status" aria-live="polite">
			<span class="loading loading-lg loading-spinner"></span>
		</div>
	{:else if !exp.media || !hlsReady || !snapshot}
		{@render message("The video isn't ready yet.", "It is still being processed.")}
	{:else}
		<VideoPlayer
			bind:this={player}
			source={{ src: `/media/${exp.media.id}/master.m3u8`, type: HLS }}
			timing={snapshot}
			bind:currentTime={time}
			bind:paused
			bind:playbackRate={rate}
			bind:quality
			bind:qualities
			bind:muted
			bind:fullscreen
			{overlay}
		/>
	{/if}
</div>

{#snippet message(title: string, text: string)}
	<div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
		<p class="text-xl font-semibold">{title}</p>
		<p class="text-white/70">{text}</p>
	</div>
{/snippet}

{#snippet overlay()}
	{#if activated && slateVisible && shareUrl}
		<ScreeningSlate url={shareUrl} exportName={exp?.name ?? ""} />
	{/if}
	{#if !activated}
		<!-- Browsers only play with sound in a window the user has clicked: one click here, before
		     anything else shows. The click itself is what counts (readActivation on pointerdown). -->
		<div class="absolute inset-0 z-20 flex items-center justify-center bg-black">
			<button class="btn btn-lg btn-primary" onclick={readActivation}>Activate Player</button>
		</div>
	{:else if snapshot}
		<div
			class="absolute inset-x-0 bottom-0 z-20 transition-opacity duration-200"
			class:opacity-0={!chromeVisible}
			class:pointer-events-none={!chromeVisible}
		>
			<ScreeningControls
				timing={snapshot}
				durationFrames={snapshot.durationFrameCount}
				bind:currentTime={time}
				bind:paused
				bind:playbackRate={rate}
				{fullscreen}
				onFullscreen={() => player?.toggleFullscreen()}
			/>
		</div>
	{/if}
{/snippet}
