<script lang="ts">
	import { page } from "$app/state";
	import { resolve } from "$app/paths";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();

	const tabs = $derived([
		{
			label: "System",
			href: resolve("/(root)/admin"),
		},
		{
			label: "Storage",
			href: resolve("/(root)/admin/storage"),
		},
		{
			label: "Organizations",
			href: resolve("/(root)/admin/organizations"),
		},
		{
			label: "Users",
			href: resolve("/(root)/admin/users"),
		},
	]);
</script>

<h1 class="text-xl font-bold">Administration</h1>
<div role="tablist" class="tabs tabs-border mx-6 mt-6">
	{#each tabs as tab (tab.href)}
		<a role="tab" href={tab.href} class="tab" class:tab-active={page.url.pathname === tab.href}>
			{tab.label}
		</a>
	{/each}
</div>

<div class="mt-6">
	{@render children()}
</div>
