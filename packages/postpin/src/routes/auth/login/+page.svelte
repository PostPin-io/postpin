<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { authClient } from "#lib/auth-client.ts";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { safeRedirect } from "#lib/redirect.ts";
	import { DISABLE_PASSWORD_LOGIN } from "$app/env/public";
	import SsoButtons, { oauthErrorMessage } from "#lib/components/auth/SsoButtons.svelte";
	import Fingerprint from "@lucide/svelte/icons/fingerprint";
	import { isPasskeyCancel } from "#lib/components/auth/passkey-errors.ts";
	import { onMount } from "svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const redirectTo = safeRedirect(page.url.searchParams.get("redirect"));
	// keeps ?redirect= (and the invited email) when switching between login and signup
	const authQuery = page.url.search;

	let email = $state(page.url.searchParams.get("email") ?? "");
	let password = $state("");
	let isLoading = $state(false);
	let passkeyLoading = $state(false);
	let errorText = $state<string | null>(oauthErrorMessage(page.url.searchParams.get("error")));

	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		if (isLoading) return;
		isLoading = true;
		errorText = null;

		await authClient.signIn.email(
			{ email, password, callbackURL: redirectTo },
			{
				onSuccess: (ctx) => {
					// twoFactorClient sends the user on to /auth/two-factor
					if (ctx.data?.twoFactorRedirect) return;
					goto(redirectTo);
				},
				onError: (ctx) => {
					errorText = ctx.error.message ?? "Something went wrong while logging in.";
					isLoading = false;
				},
			},
		);
	}

	async function passkeySignIn(autoFill = false) {
		if (!autoFill) {
			passkeyLoading = true;
			errorText = null;
		}
		const { error } = await authClient.signIn.passkey({ autoFill });
		if (!error) return goto(redirectTo);
		passkeyLoading = false;
		// autofill waits silently in the background; cancelling a prompt isn't an error worth showing
		if (!autoFill && !isPasskeyCancel(error)) {
			errorText = error.message ?? "Could not sign in with a passkey.";
		}
	}

	onMount(() => {
		// offers saved passkeys in the email field's autofill (conditional mediation)
		void window.PublicKeyCredential?.isConditionalMediationAvailable?.().then((available) => {
			if (available) void passkeySignIn(true);
		});
	});
</script>

<PageMeta title="Login" description="Log in to your PostPin account." />

<header class="space-y-1.5 text-center">
	<h1 class="text-2xl font-semibold">Welcome back</h1>
	<p class="text-sm text-base-content/70">Log in to continue to PostPin.</p>
</header>

<div class="space-y-4">
	{#if errorText}
		<div class="alert alert-error" role="alert">{errorText}</div>
	{/if}

	{#if !DISABLE_PASSWORD_LOGIN}
		<form class="space-y-4" onsubmit={handleLogin}>
			<label class="block w-full">
				<span class="mb-1.5 block text-sm font-medium">Email</span>
				<input
					type="email"
					placeholder="you@example.com"
					class="input w-full"
					autocomplete="username webauthn"
					required
					bind:value={email}
				/>
			</label>

			<div>
				<div class="mb-1.5 flex items-baseline justify-between">
					<label for="login-password" class="text-sm font-medium">Password</label>
					<a class="link text-sm link-hover" href="/auth/reset-password">Forgot password?</a>
				</div>
				<input
					id="login-password"
					type="password"
					placeholder="Your password"
					class="input w-full"
					autocomplete="current-password"
					required
					bind:value={password}
				/>
			</div>

			<button type="submit" class="btn w-full btn-primary" disabled={isLoading}>
				{#if isLoading}
					<span class="loading loading-md loading-spinner"></span>
				{:else}
					Log in
				{/if}
			</button>
		</form>

		<div class="divider my-2 text-xs text-base-content/60">OR</div>
	{/if}

	<div class="flex flex-col gap-2">
		<SsoButtons
			providers={data.providers}
			callbackURL={redirectTo}
			newUserCallbackURL={safeRedirect(page.url.searchParams.get("redirect"), "/welcome")}
			onerror={(message) => (errorText = message)}
		/>

		<button
			type="button"
			class="auth-button"
			onclick={() => passkeySignIn()}
			disabled={passkeyLoading}
			aria-busy={passkeyLoading}
		>
			<Fingerprint class="size-5 shrink-0" aria-hidden="true" />
			<span class="auth-button-label">Sign in with a passkey</span>
			{#if passkeyLoading}
				<span class="loading loading-xs loading-spinner"></span>
			{/if}
		</button>
	</div>
</div>

{#if !DISABLE_PASSWORD_LOGIN || data.providers.length > 0}
	<p class="text-center text-sm text-base-content/70">
		New to PostPin? <a class="link link-primary" href={`/auth/signup${authQuery}`}
			>Create an account</a
		>
	</p>
{/if}
