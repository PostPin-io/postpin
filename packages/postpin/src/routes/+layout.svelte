<script lang="ts">
	import type { LayoutProps } from "./$types";

	import "./layout.css";
	import UploadIndicator from "#lib/components/exports/UploadIndicator.svelte";
	import HeldUploadPopover from "#lib/components/exports/HeldUploadPopover.svelte";
	import { initTheme } from "#lib/theme.svelte.ts";
	import { page } from "$app/state";
	import GuideHost from "#lib/components/guides/GuideHost.svelte";

	let { children }: LayoutProps = $props();

	initTheme();
</script>

<div class="h-full">
	{@render children()}
</div>
<!-- Here, not in (root)'s layout: the review page (+page@) leaves that one out. Signed-in pages
     only, and on its own boundary: a guide must never hold up or break the page. -->
{#if page.route.id?.startsWith("/(root)/")}
	<svelte:boundary>
		<GuideHost />
		{#snippet pending()}{/snippet}
		{#snippet failed()}{/snippet}
	</svelte:boundary>
{/if}
<UploadIndicator />
<HeldUploadPopover />
