<script lang="ts">
	import { page } from "$app/state";
	import { resolve } from "$app/paths";
	import type { LayoutProps } from "./$types";

	let { data, children }: LayoutProps = $props();

	const organization = $derived(page.params.organization!);
	const tabs = $derived([
		...(data.canEditSettings
			? [
					{
						label: "General",
						href: resolve("/(root)/organizations/[organization]/settings", { organization }),
					},
				]
			: []),
		{
			label: "Members",
			href: resolve("/(root)/organizations/[organization]/settings/members", { organization }),
		},
	]);
</script>

<h1 class="text-xl font-bold">Organization settings</h1>
<div role="tablist" class="tabs tabs-border mx-6 mt-6">
	{#each tabs as tab (tab.href)}
		<a role="tab" href={tab.href} class="tab" class:tab-active={page.url.pathname === tab.href}>
			{tab.label}
		</a>
	{/each}
</div>

{@render children()}
