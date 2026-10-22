<script lang="ts">
	import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";
	import { onMount } from "svelte";

	interface Props {
		data: MovieBarcode;
	}

	let { data }: Props = $props();
	let canvas: HTMLCanvasElement;

	onMount(() => {
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const bytes = Uint8Array.from(atob(data.colors), (c) => c.charCodeAt(0));
		const img = ctx.createImageData(data.count, 1);
		for (let i = 0; i < data.count; i++) {
			img.data.set([bytes[i * 3]!, bytes[i * 3 + 1]!, bytes[i * 3 + 2]!, 255], i * 4);
		}
		ctx.putImageData(img, 0, 0);
	});
</script>

<canvas
	bind:this={canvas}
	width={data.count}
	height={1}
	class="h-4 w-full [image-rendering:pixelated]"
></canvas>
