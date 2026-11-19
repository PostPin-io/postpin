<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { afterNavigate, goto, refreshAll } from "$app/navigation";

	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Menu from "@lucide/svelte/icons/menu";
	import Monitor from "@lucide/svelte/icons/monitor";
	import Moon from "@lucide/svelte/icons/moon";
	import Settings from "@lucide/svelte/icons/settings";
	import Shield from "@lucide/svelte/icons/shield";
	import User from "@lucide/svelte/icons/user";
	import Sun from "@lucide/svelte/icons/sun";
	import { theme, type ThemePreference } from "#lib/theme.svelte.ts";

	import type { Snippet } from "svelte";
	import Logo from "#lib/components/layout/Logo.svelte";

	import Breadcrumbs from "#lib/components/layout/Breadcrumbs.svelte";
	import GuideButton from "#lib/components/guides/GuideButton.svelte";

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

	const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
		{ value: "system", label: "System", icon: Monitor },
		{ value: "light", label: "Light", icon: Sun },
		{ value: "dark", label: "Dark", icon: Moon },
	];

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
	<!-- links to other pages: all with an icon -->
	<li>
		<a href={resolve("/(root)/profile")}>
			<User class="size-4" />
			Profile
		</a>
	</li>
	{#if activeOrganization}
		<li>
			<a
				href={resolve("/(root)/organizations/[organization]/settings", {
					organization: activeOrganization.slug,
				})}
			>
				<Settings class="size-4" />
				Settings
			</a>
		</li>
	{/if}
	<li>
		<a href={resolve("/(root)/guides")} data-guide="postpin-guides/page">
			<GraduationCap class="size-4" />
			PostPin Guides
		</a>
	</li>
	{#if mobile && page.data.isSystemAdmin}
		<li>
			<a href={resolve("/(root)/admin")}>
				<Shield class="size-4" />
				System
			</a>
		</li>
	{/if}
	<li></li>
	<!-- actions: theme and logout -->
	<!-- a row like the items above, so it lines up with them and the dividers -->
	<li>
		<div class="cursor-default justify-between py-1 hover:bg-transparent active:bg-transparent!">
			Theme
			<div class="join" role="group" aria-label="Theme">
				{#each themes as { value, label, icon: Icon } (value)}
					<button
						type="button"
						class="btn join-item btn-square btn-xs"
						class:btn-active={theme.preference === value}
						aria-pressed={theme.preference === value}
						title={label}
						onclick={() => theme.set(value)}
					>
						<Icon class="size-3.5" />
						<span class="sr-only">{label}</span>
					</button>
				{/each}
			</div>
		</div>
	</li>
	<li></li>
	<li><button onclick={logout}>Logout</button></li>
{/snippet}

<!--
	`collapse` isolates the header into its own stacking context, so without a z-index its
	dropdowns would open behind any positioned page content below it.
-->
<header class="w-full rounded-md bg-base-200 shadow-sm max-lg:collapse max-lg:z-50">
	<input id="navbar-1-toggle" class="peer hidden" type="checkbox" bind:checked={menuOpen} />
	<label for="navbar-1-toggle" class="fixed inset-0 hidden max-lg:peer-checked:block"></label>

	<nav class="collapse-title navbar max-lg:px-2">
		<div class="navbar-start min-w-0 max-lg:w-full">
			<label
				for="navbar-1-toggle"
				class="btn btn-square btn-ghost lg:hidden"
				aria-label="Menu"
				data-guide="postpin-guides/menu"
			>
				<Menu class="size-5" />
			</label>
			<a
				href={resolve("/(root)/dashboard")}
				class="btn btn-ghost text-xl max-lg:btn-square"
				aria-label="Dashboard"
				data-guide="navigation/go-home navigation/home"
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
			<GuideButton guide="navigation" />
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
				<div tabindex="0" role="button" class="btn btn-ghost" data-guide="postpin-guides/menu">
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
