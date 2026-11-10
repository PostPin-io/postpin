<script lang="ts">
	import type { LayoutProps } from "./$types";
	let { children }: LayoutProps = $props();
	import Header from "#lib/components/layout/Header.svelte";
	import Footer from "#lib/components/layout/Footer.svelte";
</script>

<div class="h-full">
	<Header />
	<main class="mx-auto max-w-4xl px-4 py-8">
		{@render children()}
	</main>
	<Footer />
</div>
