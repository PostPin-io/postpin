<script lang="ts">
	import { DotLottie } from "@lottiefiles/dotlottie-web";
	import wasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
	import { onMount } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { theme } from "#lib/theme.svelte.ts";

	let { ...props }: HTMLAttributes<HTMLCanvasElement> = $props();

	const darkSrc = "/animations/logo-loading-dark.lottie";
	const lightSrc = "/animations/logo-loading-light.lottie";

	let canvas: HTMLCanvasElement;
	let player: DotLottie | undefined;
	let loadedSrc: string | undefined;
	// The light variant has a dark bar, the dark variant a light one.
	let isDark = $derived(theme.isDark);

	onMount(() => {
		DotLottie.setWasmUrl(wasmUrl);
		loadedSrc = isDark ? darkSrc : lightSrc;
		player = new DotLottie({ canvas, src: loadedSrc, loop: true, autoplay: true });

		return () => player?.destroy();
	});

	$effect(() => {
		const src = isDark ? darkSrc : lightSrc;
		if (!player || src === loadedSrc) return;
		loadedSrc = src;
		player.load({ src, loop: true, autoplay: true });
	});
</script>

<canvas bind:this={canvas} width="512" height="512" aria-hidden="true" {...props}></canvas>
