<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { afterNavigate, goto, refreshAll } from "$app/navigation";

	import Menu from "@lucide/svelte/icons/menu";

	import type { Snippet } from "svelte";
	import Logo from "#lib/components/layout/Logo.svelte";

	import Breadcrumbs from "#lib/components/layout/Breadcrumbs.svelte";

	const session = authClient.useSession();
	const organizations = authClient.useListOrganizations();
	// Mobile menu: closes again after every navigation
	let menuOpen = $state(false);
	afterNavigate(() => (menuOpen = false));

	let activeOrganizationId = $derived($session.data?.session.activeOrganizationId);
	let activeOrganization = $derived(
		$organizations.data?.find((org) => org.id === activeOrganizationId),
	);

	async function switchOrganization(organizationId: string) {
		(document.activeElement as HTMLElement | null)?.blur();
		const { error } = await authClient.organization.setActive({ organizationId });
		if (error) {
			alert(`Could not switch organization: ${error.message}`);
			return;
		}
		goto(resolve("/(root)/dashboard"), { replaceState: true });
		refreshAll();
	}

	async function logout() {
		await authClient.signOut();
		await goto(resolve("/auth/login"));
	}

	interface Props {
		children?: Snippet;
		/** Buttons next to the account menu (desktop only, like the menu itself) */
		actions?: Snippet;
	}

	let { children, actions }: Props = $props();
</script>

{#snippet accountItems(mobile: boolean)}
	{#if $organizations.data?.length}
		<li class="menu-title">Organizations</li>
		{#each $organizations.data as org (org.id)}
			<li>
				<button
					class:menu-active={org.id === activeOrganizationId}
					onclick={() => switchOrganization(org.id)}
				>
					{org.name}
				</button>
			</li>
		{/each}
		<li></li>
	{/if}
	<li><a href={resolve("/(root)/profile")}>Profile</a></li>
	{#if activeOrganization}
		<li>
			<a
				href={resolve("/(root)/organizations/[organization]/settings", {
					organization: activeOrganization.slug,
				})}>Settings</a
			>
		</li>
	{/if}
	{#if mobile && page.data.isSystemAdmin}
		<li><a href={resolve("/(root)/admin")}>System</a></li>
	{/if}
	<li><button onclick={logout}>Logout</button></li>
{/snippet}

<header class="w-full rounded-md bg-base-200 shadow-sm max-lg:collapse">
	<input id="navbar-1-toggle" class="peer hidden" type="checkbox" bind:checked={menuOpen} />
	<label for="navbar-1-toggle" class="fixed inset-0 hidden max-lg:peer-checked:block"></label>

	<nav class="collapse-title navbar max-lg:px-2">
		<div class="navbar-start min-w-0 max-lg:w-full">
			<label for="navbar-1-toggle" class="btn btn-square btn-ghost lg:hidden" aria-label="Menu">
				<Menu class="size-5" />
			</label>
			<a
				href={resolve("/(root)/dashboard")}
				class="btn btn-ghost text-xl max-lg:btn-square"
				aria-label="Dashboard"
			>
				<Logo class="h-6 w-auto" />
				<span class="flex items-center gap-2 max-lg:hidden">
					{#if activeOrganization}
						{activeOrganization.name}
						<span class="font-normal text-base-content/40">|</span>
					{/if}
					PostPin
				</span>
			</a>
			<Breadcrumbs />
			{#if page.data.isSystemAdmin}
				<ul class="menu menu-horizontal px-1 max-lg:hidden">
					<li><a href={resolve("/(root)/admin")}>System</a></li>
				</ul>
			{/if}
		</div>
		{#if children}
			<div class="navbar-center hidden lg:flex">{@render children()}</div>
		{/if}
		<div class="navbar-end gap-1 max-lg:hidden">
			{#if actions}{@render actions()}{/if}
			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" class="btn btn-ghost">
					{$session.data?.user.name ?? "Account"}
				</div>
				<ul
					tabindex="-1"
					class="menu dropdown-content z-10 mt-2 w-56 rounded-box bg-base-100 p-2 shadow"
				>
					{@render accountItems(false)}
				</ul>
			</div>
		</div>
	</nav>

	<div class="collapse-content z-1 lg:hidden">
		<ul class="menu w-full">
			<li class="menu-title">{$session.data?.user.name ?? "Account"}</li>
			{@render accountItems(true)}
		</ul>
	</div>
</header>
