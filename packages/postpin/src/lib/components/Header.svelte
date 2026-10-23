<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { goto, refreshAll } from "$app/navigation";
	import { hasRole, MANAGER_ROLES } from "#lib/roles.ts";
	import type { Snippet } from "svelte";

	const session = authClient.useSession();
	const organizations = authClient.useListOrganizations();
	const activeMember = authClient.useActiveMember();

	let activeOrganizationId = $derived($session.data?.session.activeOrganizationId);
	let activeOrganization = $derived(
		$organizations.data?.find((org) => org.id === activeOrganizationId),
	);
	let canManageThisOrg = $derived(
		$activeMember.data ? hasRole($activeMember.data.role, MANAGER_ROLES) : false,
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
	}

	let { children }: Props = $props();
</script>

<!-- 
<header>
	<div class="corner">
		<a href="https://svelte.dev/docs/kit">
			<img src={logo} alt="SvelteKit" />
		</a>
	</div>

	<nav>
		<ul>
			<li aria-current={page.url.pathname === "/" ? "page" : undefined}>
				<a href={resolve("/")}>Home</a>
			</li>
			<li aria-current={page.url.pathname === "/about" ? "page" : undefined}>
				<a href={resolve("/about")}>About</a>
			</li>
			<li aria-current={page.url.pathname === "/dbtests" ? "page" : undefined}>
				<a href={resolve("/dbtests")}>dbtests</a>
			</li>
		</ul>
	</nav>
</header>

<style>
</style> -->

<header class="w-full rounded-md bg-base-200 shadow-sm max-lg:collapse">
	<input id="navbar-1-toggle" class="peer hidden" type="checkbox" />
	<label for="navbar-1-toggle" class="fixed inset-0 hidden max-lg:peer-checked:block"></label>

	<nav class="collapse-title navbar">
		<div class="navbar-start">
			<label for="navbar-1-toggle" class="btn btn-ghost lg:hidden">
				<svg
					aria-label="Menu"
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h8m-8 6h16"
					/></svg
				>
			</label>
			<a href={resolve("/(root)/dashboard")} class="btn btn-ghost text-xl">
				{#if activeOrganization}
					{activeOrganization.name}
					<span class="font-normal text-base-content/40">|</span>
				{/if}
				PostPin
			</a>
			{#if activeOrganization && canManageThisOrg}
				<a href={`/organizations/${activeOrganization.slug}/members`} class="btn btn-ghost btn-sm"
					>Members</a
				>
				<a href={`/organizations/${activeOrganization.slug}/settings`} class="btn btn-ghost btn-sm"
					>Settings</a
				>
			{/if}
			<ul class="menu menu-horizontal px-1">
				{#if page.params.project && page.params.timeline}
					<li>
						<a
							href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports", {
								project: page.params.project,
								timeline: page.params.timeline,
							})}
							class="btn btn-ghost btn-sm">Exports</a
						>
					</li>
				{/if}
			</ul>
		</div>
		<div class="navbar-center hidden lg:flex"></div>
		{#if children}
			<div class="navbar-center hidden lg:flex">{@render children()}</div>
		{/if}
		<div class="navbar-end">
			<input type="text" placeholder="Search" class="input w-64 lg:w-auto" />
			<div class="dropdown dropdown-end ml-2">
				<div tabindex="0" role="button" class="btn btn-ghost">
					{$session.data?.user.name ?? "Account"}
				</div>
				<ul
					tabindex="-1"
					class="menu dropdown-content z-10 mt-2 w-56 rounded-box bg-base-100 p-2 shadow"
				>
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
						<div class="divider my-1"></div>
					{/if}
					<li><a href={resolve("/(root)/profile")}>Profile</a></li>
					<li><button onclick={logout}>Logout</button></li>
				</ul>
			</div>
		</div>
	</nav>

	<div class="collapse-content z-1 lg:hidden">
		<ul class="menu">
			<li><button>Item 1</button></li>
			<li>
				<button>Parent</button>
				<ul>
					<li><button>Submenu 1</button></li>
					<li><button>Submenu 2</button></li>
				</ul>
			</li>
			<li><button>Item 3</button></li>
		</ul>
	</div>
</header>
