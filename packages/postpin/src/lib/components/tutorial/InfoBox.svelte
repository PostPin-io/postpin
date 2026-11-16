<script lang="ts">
	// The explanation of a tutorial step, set apart from what there is to do
	import Info from "@lucide/svelte/icons/info";
	import type { Snippet } from "svelte";

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex gap-3 rounded-box bg-base-200 p-4 text-sm text-base-content/80">
	<Info class="mt-0.5 size-4 shrink-0 text-info" />
	<p class="min-w-0">{@render children()}</p>
</div>
