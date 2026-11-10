<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		// "right" points from the NLE to PostPin, "both" has heads on both ends
		direction: "right" | "both";
		disabled?: boolean;
		children: Snippet;
	}

	let { direction, disabled = false, children }: Props = $props();

	// the path points right
	const ROTATION = { right: "", left: "rotate-180", up: "-rotate-90", down: "rotate-90" };
</script>

{#snippet head(towards: keyof typeof ROTATION, visibility: string)}
	<svg viewBox="0 0 10 12" class={["size-3 shrink-0 fill-current", ROTATION[towards], visibility]}>
		<path d="M0 0L10 6L0 12z" />
	</svg>
{/snippet}

{#snippet line()}
	<!-- grows to fill the cell, so the arrow reaches the boxes on both sides -->
	<span class="min-h-3 w-0.5 flex-1 bg-current @3xl:h-0.5 @3xl:min-h-0 @3xl:w-auto @3xl:min-w-4"
	></span>
{/snippet}

<!-- Stacked (below @3xl) PostPin is above and the NLE below, so the arrow runs vertically.
     Wide, the NLE is left and PostPin right, so it runs horizontally. -->
<div class={["flex w-full flex-1 flex-col items-center @3xl:flex-row", disabled && "opacity-40"]}>
	{@render head("up", "@3xl:hidden")}
	{#if direction === "both"}
		{@render head("left", "hidden @3xl:block")}
	{/if}
	{@render line()}
	<div class="max-w-full min-w-0 @3xl:mx-auto">{@render children()}</div>
	{@render line()}
	{#if direction === "both"}
		{@render head("down", "@3xl:hidden")}
	{/if}
	{@render head("right", "hidden @3xl:block")}
</div>
