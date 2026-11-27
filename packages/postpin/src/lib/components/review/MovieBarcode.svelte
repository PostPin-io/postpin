<script lang="ts">
	import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";

	interface Props {
		data: MovieBarcode;
		class?: string;
	}

	let { data, class: className = "h-4" }: Props = $props();
	let canvas = $state<HTMLCanvasElement>();

	// An effect, not onMount: the timeline keeps the canvas while the export's media changes
	$effect(() => {
		const ctx = canvas?.getContext("2d");
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
	class="block w-full [image-rendering:pixelated] {className}"
></canvas>
