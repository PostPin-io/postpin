<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { getInviteLinkInfo, joinViaLink } from "./join.remote.ts";

	const token = page.params.token!;
	const link = $derived(await getInviteLinkInfo(token));
	const authQuery = new URLSearchParams({ redirect: `/auth/join/${token}` });

	let joining = $state(false);
	let errorMessage = $state<string | null>(null);

	async function join() {
		joining = true;
		errorMessage = null;
		try {
			await joinViaLink(token);
		} catch (e) {
			errorMessage = (e as { body?: { message?: string } }).body?.message ?? "Could not join.";
			joining = false;
			return;
		}
		authClient.$store.notify("$listOrg");
		authClient.$store.notify("$sessionSignal");
		await goto("/dashboard", { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Join organization | PostPin</title>
</svelte:head>

{#if !link.valid}
	<header class="space-y-2 text-center">
		<h1 class="text-3xl font-bold">Invite link not valid</h1>
		<p class="text-base-content/70">
			This link was turned off or reset. Ask the organization for a new one.
		</p>
	</header>
	<a class="btn w-full" href="/dashboard">Go to dashboard</a>
{:else}
	<header class="space-y-2 text-center">
		<h1 class="text-3xl font-bold">Join {link.organizationName}</h1>
		<p class="text-base-content/70">
			{#if link.alreadyMember}
				You're already a member of this organization.
			{:else}
				You'll join as <span class="font-medium">{link.role}</span>.
			{/if}
		</p>
	</header>

	{#if errorMessage}
		<div class="alert alert-error" role="alert">{errorMessage}</div>
	{/if}

	{#if !link.signedIn}
		<div class="flex flex-col gap-2">
			<a class="btn btn-primary" href={`/auth/signup?${authQuery}`}>Create an account</a>
			<a class="btn" href={`/auth/login?${authQuery}`}>Log in</a>
		</div>
	{:else}
		<button class="btn w-full btn-primary" onclick={join} disabled={joining}>
			{link.alreadyMember ? "Open organization" : "Join organization"}
			{#if joining}<span class="loading loading-spinner"></span>{/if}
		</button>
	{/if}
{/if}
