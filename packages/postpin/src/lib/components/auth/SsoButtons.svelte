<script lang="ts" module>
	/** The `?error=` better-auth appends when an SSO/social sign-in fails, in words */
	export function oauthErrorMessage(code: string | null): string | null {
		if (!code) return null;
		switch (code) {
			case "account_not_linked":
				return "An account with this email already exists. Log in with your password, then connect the provider in your profile.";
			case "email_not_found":
				return "The provider didn't share an email address with PostPin.";
			case "account_already_linked_to_different_user":
				return "This account is already connected to another PostPin user.";
			case "signup_disabled":
				return "There's no PostPin account for this email yet.";
			case "email_does_not_match":
				return "That account uses a different email address than your PostPin account.";
			case "access_denied":
				return "Sign-in was cancelled.";
			default:
				return "Signing in with that provider didn't work. Please try again.";
		}
	}
</script>

<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import ProviderIcon from "./ProviderIcon.svelte";
	import { page } from "$app/state";

	type Provider = { id: string; name: string };

	let {
		providers,
		callbackURL,
		newUserCallbackURL = callbackURL,
		onerror,
	}: {
		providers: Provider[];
		/** where to go after signing in */
		callbackURL: string;
		/** where a brand-new account goes instead */
		newUserCallbackURL?: string;
		onerror: (message: string) => void;
	} = $props();

	let pending = $state<string | null>(null);

	async function signIn(provider: Provider) {
		pending = provider.id;
		// failures come back to this page as ?error=…
		const errorCallbackURL = page.url.pathname + page.url.search;
		const { error } = await authClient.signIn.social({
			provider: provider.id,
			callbackURL,
			newUserCallbackURL,
			errorCallbackURL,
		});
		// on success the browser is already on its way to the provider
		if (error) {
			pending = null;
			onerror(error.message ?? `Could not sign in with ${provider.name}.`);
		}
	}
</script>

<!-- One look for all providers (.auth-button in layout.css); only the logos are the providers'
own. Microsoft's guidelines allow no other label than "Sign in with Microsoft". -->
{#if providers.length > 0}
	<div class="flex flex-col gap-2">
		{#each providers as provider (provider.id)}
			<button
				type="button"
				class="auth-button"
				disabled={pending !== null}
				aria-busy={pending === provider.id}
				onclick={() => signIn(provider)}
			>
				<ProviderIcon id={provider.id} />
				<span class="auth-button-label">
					{provider.id === "microsoft"
						? "Sign in with Microsoft"
						: `Continue with ${provider.name}`}
				</span>
				{#if pending === provider.id}
					<span class="loading loading-xs loading-spinner"></span>
				{/if}
			</button>
		{/each}
	</div>
{/if}
