<script lang="ts">
	import type { LayoutProps } from "./$types";
	import { afterNavigate } from "$app/navigation";
	import Header from "#lib/components/layout/Header.svelte";
	import Footer from "#lib/components/layout/Footer.svelte";

	let { children }: LayoutProps = $props();

	// The page scrolls inside this element, not the window, so the scrollbar starts below the
	// header. SvelteKit only resets the window's scroll position, so new pages start at the top here.
	let scroller: HTMLElement | null = $state(null);
	afterNavigate(({ type, to }) => {
		if (type !== "popstate" && !to?.url.hash) scroller?.scrollTo(0, 0);
	});
</script>

<div class="flex h-full flex-col">
	<div class="z-50 shrink-0">
		<Header />
	</div>
	<div bind:this={scroller} class="flex min-h-0 flex-1 flex-col overflow-y-auto">
		<main class="mx-auto w-full max-w-4xl flex-1 px-4 py-4 md:py-8">
			{@render children()}
		</main>
		<Footer />
	</div>
</div>
