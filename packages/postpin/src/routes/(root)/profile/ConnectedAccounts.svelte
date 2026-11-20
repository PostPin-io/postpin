<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import ProviderIcon from "#lib/components/auth/ProviderIcon.svelte";
	import { oauthErrorMessage } from "#lib/components/auth/SsoButtons.svelte";
	import { page } from "$app/state";
	import { getSignInMethods } from "./profile.remote.ts";

	type Message = { type: "success" | "error"; text: string } | null;
	type Provider = { id: string; name: string; accountId: string | null; linked: boolean };

	let { providers, canUnlink }: { providers: Provider[]; canUnlink: boolean } = $props();

	let busy = $state<string | null>(null);
	// a failed link comes back to /profile?error=…
	let message = $state<Message>(
		page.url.searchParams.get("error")
			? { type: "error", text: oauthErrorMessage(page.url.searchParams.get("error"))! }
			: null,
	);

	async function link(provider: Provider) {
		busy = provider.id;
		message = null;
		const { error } = await authClient.linkSocial({
			provider: provider.id,
			callbackURL: "/profile",
			errorCallbackURL: "/profile",
		});
		// on success the browser is on its way to the provider
		if (error) {
			busy = null;
			message = { type: "error", text: error.message ?? `Could not connect ${provider.name}.` };
		}
	}

	async function unlink(provider: Provider) {
		if (!confirm(`Disconnect ${provider.name}? You can't log in with it afterwards.`)) return;
		busy = provider.id;
		message = null;
		const { error } = await authClient.unlinkAccount({ accountId: provider.accountId! });
		busy = null;
		if (error) {
			message = { type: "error", text: error.message ?? `Could not disconnect ${provider.name}.` };
			return;
		}
		await getSignInMethods().refresh();
	}
</script>

{#if providers.length > 0}
	<div class="flex flex-col gap-2">
		<div class="text-sm font-medium">Connected accounts</div>
		<p class="text-xs text-base-content/70">Log in with these instead of your password.</p>

		{#if message}
			<div class="alert alert-soft py-2 text-sm alert-error" role="alert">
				<span>{message.text}</span>
			</div>
		{/if}

		<ul class="divide-y divide-base-200">
			{#each providers as provider (provider.id)}
				<li class="flex items-center justify-between gap-2 py-1.5">
					<div class="flex items-center gap-2 text-sm">
						<ProviderIcon id={provider.id} />
						{provider.name}
						{#if provider.linked}
							<span class="badge badge-soft badge-sm badge-success">Connected</span>
						{/if}
					</div>
					{#if provider.linked}
						<button
							type="button"
							class="btn btn-ghost text-error btn-xs"
							disabled={busy !== null || !canUnlink}
							title={canUnlink ? undefined : "This is your only way to log in"}
							onclick={() => unlink(provider)}
						>
							Disconnect
							{#if busy === provider.id}<span class="loading loading-xs loading-spinner"
								></span>{/if}
						</button>
					{:else}
						<button
							type="button"
							class="btn btn-xs"
							disabled={busy !== null}
							onclick={() => link(provider)}
						>
							Connect
							{#if busy === provider.id}<span class="loading loading-xs loading-spinner"
								></span>{/if}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
