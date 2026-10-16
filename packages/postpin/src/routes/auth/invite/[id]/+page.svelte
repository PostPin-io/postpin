<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { getInvitationPreview } from "./invite.remote.ts";

	const id = page.params.id!;
	const invite = $derived(await getInvitationPreview(id));
	const authQuery = $derived(
		new URLSearchParams({ redirect: `/auth/invite/${id}`, email: invite.email ?? "" }),
	);

	let busy = $state<"accept" | "decline" | "signout" | null>(null);
	let errorMessage = $state<string | null>(null);

	async function accept() {
		busy = "accept";
		errorMessage = null;
		const { data, error } = await authClient.organization.acceptInvitation({ invitationId: id });
		if (error) {
			errorMessage = error.message ?? "Could not accept the invitation.";
			busy = null;
			return;
		}
		await authClient.organization.setActive({ organizationId: data.invitation.organizationId });
		authClient.$store.notify("$listOrg");
		authClient.$store.notify("$sessionSignal");
		await goto("/dashboard", { invalidateAll: true });
	}

	async function decline() {
		busy = "decline";
		errorMessage = null;
		const { error } = await authClient.organization.rejectInvitation({ invitationId: id });
		if (error) {
			errorMessage = error.message ?? "Could not decline the invitation.";
			busy = null;
			return;
		}
		await goto("/dashboard");
	}

	async function signOut() {
		busy = "signout";
		await authClient.signOut();
		await goto(`/auth/login?${authQuery}`, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Invitation | PostPin</title>
</svelte:head>

{#if !invite.valid}
	<header class="space-y-2 text-center">
		<h1 class="text-3xl font-bold">Invitation not found</h1>
		<p class="text-base-content/70">
			This invitation has expired, was revoked, or has already been used.
		</p>
	</header>
	<a class="btn w-full" href="/dashboard">Go to dashboard</a>
{:else}
	<header class="space-y-2 text-center">
		<h1 class="text-3xl font-bold">Join {invite.organizationName}</h1>
		<p class="text-base-content/70">
			You've been invited to join as <span class="font-medium">{invite.role}</span>.
		</p>
	</header>

	{#if errorMessage}
		<div class="alert alert-error" role="alert">{errorMessage}</div>
	{/if}

	{#if !invite.currentUserEmail}
		<p class="text-center text-sm text-base-content/70">
			Sign in or create an account with <span class="font-medium">{invite.email}</span> to accept.
		</p>
		<div class="flex flex-col gap-2">
			<a class="btn btn-primary" href={`/auth/signup?${authQuery}`}>Create an account</a>
			<a class="btn" href={`/auth/login?${authQuery}`}>Log in</a>
		</div>
	{:else if invite.currentUserEmail.toLowerCase() !== invite.email?.toLowerCase()}
		<div class="alert alert-warning" role="alert">
			You're signed in as {invite.currentUserEmail}, but this invitation is for {invite.email}.
		</div>
		<button class="btn w-full" onclick={signOut} disabled={busy !== null}>
			Sign in with a different account
			{#if busy === "signout"}<span class="loading loading-spinner"></span>{/if}
		</button>
	{:else}
		<div class="flex flex-col gap-2">
			<button class="btn btn-primary" onclick={accept} disabled={busy !== null}>
				Accept invitation
				{#if busy === "accept"}<span class="loading loading-spinner"></span>{/if}
			</button>
			<button class="btn btn-ghost" onclick={decline} disabled={busy !== null}>
				Decline
				{#if busy === "decline"}<span class="loading loading-spinner"></span>{/if}
			</button>
		</div>
	{/if}
{/if}
