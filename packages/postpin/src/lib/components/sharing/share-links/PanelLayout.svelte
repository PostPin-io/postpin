<script lang="ts">
	import ChartGantt from "@lucide/svelte/icons/chart-gantt";
	import MapPin from "@lucide/svelte/icons/map-pin";
	import Play from "@lucide/svelte/icons/play";

	type Part = "timeline" | "markers";

	interface Props {
		timeline: boolean;
		markers: boolean;
		/** Small read-only icon for the list; without it the panels are toggle buttons */
		mini?: boolean;
		ontoggle?: (part: Part) => void;
	}
	let { timeline, markers, mini = false, ontoggle }: Props = $props();

	const PARTS: Part[] = ["timeline", "markers"];
	const LABELS: Record<Part, string> = { timeline: "Timeline", markers: "Markers" };
	// Video top left, timeline below it, marker panel on the right (as in the export view)
	const PLACE: Record<Part, string> = {
		timeline: "col-start-1 row-start-2",
		markers: "col-start-2 row-span-2 row-start-1",
	};

	const shown = (part: Part) => (part === "timeline" ? timeline : markers);
	const summary = $derived(
		["Video", timeline && "timeline", markers && "markers"].filter(Boolean).join(" + "),
	);

	// Like the boxes in the plugin: solid when on, dashed and faded when off
	const ON = "border-base-content/50";
	const OFF = "border-dashed border-base-content/30 text-base-content/40";
</script>

{#if mini}
	<div
		class="grid h-7 w-12 shrink-0 grid-cols-[2fr_1fr] grid-rows-[3fr_1fr] gap-0.5"
		role="img"
		title={summary}
	>
		<div class="col-start-1 row-start-1 rounded-sm border {ON} bg-base-200"></div>
		{#each PARTS as part (part)}
			<div class="{PLACE[part]} rounded-sm border {shown(part) ? `${ON} bg-base-200` : OFF}"></div>
		{/each}
	</div>
{:else}
	<div
		class="grid h-44 w-74 shrink-0 grid-cols-[2fr_1fr] grid-rows-[3fr_1fr] gap-1.5"
		role="group"
		aria-label="Panel layout"
	>
		<div
			class="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 rounded-box border-2 {ON} text-base-content/60"
			title="Video, always shown"
		>
			<Play size={16} />
			<span class="text-[10px] tracking-widest uppercase">Video</span>
		</div>

		{#each PARTS as part (part)}
			<button
				type="button"
				class="{PLACE[
					part
				]} flex min-h-0 min-w-0 items-center justify-center gap-1.5 rounded-box border-2 transition-colors hover:border-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
				{part === 'timeline' ? 'flex-row' : 'flex-col'}
				{shown(part) ? ON : OFF}"
				title="{LABELS[part]} panel: {shown(part) ? 'shown' : 'hidden'} (click to toggle)"
				onclick={() => ontoggle?.(part)}
			>
				{#if part === "timeline"}<ChartGantt size={16} />{:else}<MapPin size={16} />{/if}
				<span class="text-[10px] tracking-widest uppercase">{LABELS[part]}</span>
			</button>
		{/each}
	</div>
{/if}
