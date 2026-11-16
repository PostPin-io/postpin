<script lang="ts">
	// The tutorial's card on the review page: docked in a corner, so the page stays usable
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import type { Component, Snippet } from "svelte";

	interface Props {
		title: string;
		/** The icon the explained thing has in PostPin, so it is recognized later */
		icon?: Component<{ class?: string }>;
		/** e.g. "2 of 4" */
		progress?: string;
		children: Snippet;
		/** The buttons that move on */
		actions: Snippet;
		onskip: () => void;
	}
	let { title, icon: Icon = GraduationCap, progress, children, actions, onskip }: Props = $props();
</script>

<aside
	class="fixed inset-x-2 bottom-2 z-40 max-h-[70dvh] overflow-y-auto rounded-box border-2 border-primary bg-base-100 p-4 shadow-[0_12px_48px_-8px_rgb(0_0_0/0.55)] ring-4 ring-primary/15 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-96"
	aria-label="Tutorial"
>
	<div class="flex items-center gap-2">
		<Icon class="size-5 shrink-0 text-primary" />
		<h2 class="min-w-0 flex-1 font-bold">{title}</h2>
		{#if progress}<span class="text-xs text-base-content/50">{progress}</span>{/if}
	</div>
	<div class="mt-2 space-y-2 text-sm text-base-content/80">
		{@render children()}
	</div>
	<div class="mt-4 flex flex-wrap items-center gap-2">
		<button type="button" class="btn btn-ghost btn-sm" onclick={onskip}>Skip tutorial</button>
		<span class="flex-1"></span>
		{@render actions()}
	</div>
</aside>
