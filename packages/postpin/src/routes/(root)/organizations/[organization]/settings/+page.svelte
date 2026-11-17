<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import Info from "@lucide/svelte/icons/info";
	import BookOpen from "@lucide/svelte/icons/book-open";
	import ExternalLink from "@lucide/svelte/icons/external-link";
	import OrgGeneralSettings from "./OrgGeneralSettings.svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
</script>

{#snippet about()}
	<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
		<legend class="fieldset-legend">About</legend>
		<p class="text-sm">What PostPin does, the editor plugins, and how to use it.</p>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-sm" href="/?about">
				<Info class="size-4" />
				About PostPin
			</a>
			<a class="btn btn-sm" href="https://docs.postpin.io" target="_blank" rel="noopener">
				<BookOpen class="size-4" />
				Documentation
				<ExternalLink class="size-3.5 opacity-60" />
			</a>
		</div>
	</fieldset>
{/snippet}

<!-- Every role opens this tab for About; only owners and admins get the settings around it -->
<div class="flex flex-col gap-4 p-6">
	{#if data.canEditSettings}
		<OrgGeneralSettings>{@render about()}</OrgGeneralSettings>
	{:else}
		<PageMeta title="Organization settings" />
		{@render about()}
	{/if}
</div>
