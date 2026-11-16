<script lang="ts">
	// A note of the tutorial inside a dialog, see review-tour.svelte.ts
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import type { Snippet } from "svelte";

	let { children }: { children: Snippet } = $props();
</script>

<div class="mt-2 flex gap-2 rounded-box border border-primary/30 bg-primary/5 p-3 text-sm">
	<GraduationCap class="mt-0.5 size-4 shrink-0 text-primary" />
	<p class="min-w-0">{@render children()}</p>
</div>
