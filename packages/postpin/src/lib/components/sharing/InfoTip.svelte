<script lang="ts">
	// An "i" that explains more. Hover or focus shows it; a tap keeps it open, as phones don't hover.
	// Opens to the left: put it at the end of a row, so the dialog's edge doesn't cut it off.
	import Info from "@lucide/svelte/icons/info";
	import type { Snippet } from "svelte";

	interface Props {
		label: string;
		children: Snippet;
	}
	let { label, children }: Props = $props();

	let pinned = $state(false);
</script>

<!-- z-20: above the dialog's sticky header -->
<span class="tooltip relative tooltip-left z-20 shrink-0" class:tooltip-open={pinned}>
	<span class="tooltip-content w-72 max-w-[80vw] p-3 text-left text-xs leading-relaxed font-normal">
		{@render children()}
	</span>
	<button
		type="button"
		class="btn btn-circle btn-ghost align-middle text-base-content/60 btn-xs"
		aria-label={label}
		aria-expanded={pinned}
		onclick={() => (pinned = !pinned)}
		onblur={() => (pinned = false)}
	>
		<Info class="size-4" />
	</button>
</span>
