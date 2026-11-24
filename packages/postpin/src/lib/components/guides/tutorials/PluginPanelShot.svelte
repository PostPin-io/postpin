<script lang="ts" module>
	import panels from "./plugin-panel.json";

	/** The areas of the plugin's panel a step can point at (data-guide="sync-to-nle/…" there) */
	export type PanelArea = keyof (typeof panels)["resolve"]["areas"];
	export type PanelProgram = keyof typeof panels;
</script>

<script lang="ts">
	// A screenshot of the real plugin panel with the area of the step highlighted: the tutorial
	// can't point at anything inside the plugin. Screenshots and areas are made from the panel
	// itself with demo data: `pnpm --filter @postpin-io/plugin-core run screenshots`.
	import { GUIDE_STYLE } from "#lib/guides.ts";

	interface Props {
		program: PanelProgram;
		/** The program's name, for the image's description */
		programName: string;
		highlight: PanelArea | null;
	}
	let { program, programName, highlight }: Props = $props();

	const style = GUIDE_STYLE.tutorial;
	const panel = $derived(panels[program]);
	const area = $derived.by(() => {
		if (!highlight) return null;
		const areas: Partial<Record<PanelArea, number[]>> = panel.areas;
		return areas[highlight] ?? null;
	});
</script>

<figure
	class="relative overflow-hidden rounded-box border border-base-300 bg-base-300"
	style:aspect-ratio="{panel.width} / {panel.height}"
>
	<img
		src="/guides/plugin-panel/{program}.png"
		alt="The PostPin plugin's panel in {programName}"
		class="block size-full"
		width={panel.width}
		height={panel.height}
	/>
	{#if area}
		{@const [x, y, w, h] = area as [number, number, number, number]}
		<!-- the shadow dims everything around the area, the ring marks it -->
		<div
			class="pointer-events-none absolute rounded-lg ring-3 {style.ring} transition-all duration-300 ease-out"
			style:left="calc({x}% - 4px)"
			style:top="calc({y}% - 4px)"
			style:width="calc({w}% + 8px)"
			style:height="calc({h}% + 8px)"
			style:box-shadow="0 0 0 9999px rgb(0 0 0 / 0.55)"
		></div>
	{/if}
</figure>
