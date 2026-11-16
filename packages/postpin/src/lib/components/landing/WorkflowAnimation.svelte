<script lang="ts">
	import { DotLottie } from "@lottiefiles/dotlottie-web";
	import wasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
	import { onMount } from "svelte";

	// The workflow as a UI mockup (scripts/landing-workflow-lottie.ts builds the JSON): editor,
	// upload, review in the browser, sharing with a link and QR code, the client's phone and the
	// markers going back into the editor. Plays only while visible, and from the start again each
	// time it comes back into view; with reduced motion it shows one still frame of the review.

	interface Props {
		/**
		 * Called when the animation enters another phase: "upload", "review" or "back". The phases
		 * are markers in the Lottie file, set by the generator.
		 */
		onphase?: (phase: string) => void;
		class?: string;
	}
	let { onphase, class: className = "" }: Props = $props();

	const sources = {
		light: "/animations/workflow-light.json",
		dark: "/animations/workflow-dark.json",
	};
	/** The frame shown instead of playing: the review page with the client's phone */
	const STILL_FRAME = 375;

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const dark = matchMedia("(prefers-color-scheme: dark)");
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		let visible = true;

		DotLottie.setWasmUrl(wasmUrl);
		const player = new DotLottie({
			canvas,
			src: sources[dark.matches ? "dark" : "light"],
			loop: true,
			autoplay: false,
			renderConfig: { autoResize: true },
		});

		let phase: string | undefined;
		const report = (frame: number) => {
			const marker = player.markers().find((m) => frame >= m.start && frame < m.end);
			if (!marker || marker.name === phase) return;
			phase = marker.name;
			onphase?.(phase);
		};
		player.addEventListener("frame", (event) => report(event.currentFrame));

		const sync = () => {
			if (!player.isLoaded) return;
			if (reduced.matches) {
				player.pause();
				player.setFrame(STILL_FRAME);
				report(STILL_FRAME);
			} else if (visible) player.play();
			else player.pause();
		};
		player.addEventListener("load", sync);

		const onTheme = () =>
			player.load({ src: sources[dark.matches ? "dark" : "light"], loop: true, autoplay: false });
		dark.addEventListener("change", onTheme);
		reduced.addEventListener("change", sync);

		const observer = new IntersectionObserver(([entry]) => {
			const nowVisible = !!entry?.isIntersecting;
			// scrolled back to it: start over instead of somewhere in the middle
			if (nowVisible && !visible && player.isLoaded && !reduced.matches) {
				player.setFrame(0);
				report(0);
			}
			visible = nowVisible;
			sync();
		});
		observer.observe(canvas);

		return () => {
			observer.disconnect();
			dark.removeEventListener("change", onTheme);
			reduced.removeEventListener("change", sync);
			player.destroy();
		};
	});
</script>

<!-- 16:5 like the animation; the canvas size follows the element -->
<div
	role="img"
	aria-label="How PostPin works: upload a cut from your editor, review it in the browser, share it with a link or QR code, and pull the markers back into your editor"
	class={className}
>
	<canvas bind:this={canvas} class="block aspect-[16/5] w-full" aria-hidden="true"></canvas>
</div>
