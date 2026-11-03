<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		// "right" points from the NLE to PostPin, "both" has heads on both ends
		direction: "right" | "both";
		disabled?: boolean;
		children: Snippet;
	}

	let { direction, disabled = false, children }: Props = $props();
</script>

{#snippet head(rotate: boolean)}
	<svg viewBox="0 0 10 12" class={["hidden size-3 shrink-0 fill-current @2xl:block", rotate && "rotate-180"]}>
		<path d="M0 0L10 6L0 12z" />
	</svg>
{/snippet}

<!-- The lines and heads only show in a wide window, where the nodes sit left and right of the arrow -->
<div class={["flex w-full items-center", disabled && "opacity-40"]}>
	{#if direction === "both"}
		{@render head(true)}
	{/if}
	<span class="hidden h-0.5 min-w-4 flex-1 bg-current @2xl:block"></span>
	<div class="mx-auto">{@render children()}</div>
	<span class="hidden h-0.5 min-w-4 flex-1 bg-current @2xl:block"></span>
	{@render head(false)}
</div>
