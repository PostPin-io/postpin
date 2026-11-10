<script lang="ts">
	import {
		HueyRoot,
		SaturationArea,
		ColorSwatch,
		HueSlider,
		SaturationSlider,
		LightnessSlider,
		hueyColor,
	} from "@hueycolor/svelte";

	let { value = "#1A3263", onchange }: { value?: string; onchange?: (hex: string) => void } =
		$props();

	let color = $state(hueyColor(value));
	let lastEmitted = value.toLowerCase();

	$effect(() => {
		const hex = color.toHexString().toLowerCase();
		if (hex === lastEmitted) return;
		lastEmitted = hex;
		onchange?.(hex);
	});

	const swatch = ["#007680", "#24B2FF", "#FFBA51", "#FFD013", "#F65600"];
</script>

<section class="picker w-fit !p-0">
	<HueyRoot bind:color>
		<div class="flex flex-col items-center gap-2">
			<SaturationArea />

			<div class="flex flex-col items-center gap-1">
				<HueSlider />
				<SaturationSlider />
				<LightnessSlider />
			</div>

			<ColorSwatch {swatch} />
		</div>
	</HueyRoot>
</section>

<style>
	.picker {
		--picker-width: 150px;
	}

	.picker :global([huey-area]) {
		--huey-area-width: var(--picker-width);
		--huey-area-height: 150px;
		--huey-area-radius: 6px;
	}

	.picker :global([huey-slider-track]) {
		--huey-slider-track-width: var(--picker-width);
		--huey-slider-track-height: 10px;
	}

	.picker :global([huey-slider-thumb]) {
		--huey-thumb-size: 14px;
	}

	.picker :global([huey-swatch]) {
		display: flex;
		justify-content: center;
		gap: 6px;
		width: var(--picker-width);
	}
</style>
