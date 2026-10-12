<script lang="ts">
	import type { LayoutProps } from "./$types";
	let { children }: LayoutProps = $props();
	import Header from "./Header.svelte";
</script>

<div>
	<Header />
	<main class="mx-auto max-w-4xl px-4 py-8">
		{@render children()}
	</main>
</div>
