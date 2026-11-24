<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { authClient } from "#lib/auth-client.ts"; //import the auth client
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { safeRedirect } from "#lib/redirect.ts";
	import { DISABLE_PASSWORD_LOGIN, DPA_URL, PRIVACY_URL, TERMS_URL } from "$app/env/public";
	import SsoButtons, { oauthErrorMessage } from "#lib/components/auth/SsoButtons.svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	// Someone who signs up to get somewhere (an invitation, a share link, a plugin login) goes
	// there. Everyone else starts on the dashboard, which sets up the first organization.
	const redirectTo = safeRedirect(page.url.searchParams.get("redirect"), "/dashboard");
	// keeps ?redirect= (and the invited email) when switching between login and signup
	const authQuery = page.url.search;

	let firstName = $state("");
	let lastName = $state("");
	let email = $state(page.url.searchParams.get("email") ?? "");
	let password = $state("");

	let isLoading = $state(false);

	let errorText = $state<string | null>(oauthErrorMessage(page.url.searchParams.get("error")));

	async function handleSignup(event: SubmitEvent) {
		event.preventDefault();
		if (isLoading) return; // Prevent multiple submissions
		errorText = null;

		isLoading = true;

		await authClient.signUp.email(
			{
				email, // user email address
				password, // user password -> min 8 characters by default
				name: `${firstName} ${lastName}`.trim(), // user display name
				callbackURL: redirectTo, // A URL to redirect to after the user verifies their email (optional)
			},
			{
				onSuccess: () => {
					goto(redirectTo);
				},
				onError: (ctx) => {
					// display the error message
					errorText = ctx.error.message ?? "Something went wrong while signing up.";
					isLoading = false;
				},
			},
		);
	}
</script>

<PageMeta title="Sign Up" description="Create a new PostPin account." />

<header class="space-y-1.5 text-center">
	<h1 class="text-2xl font-semibold">Create an account</h1>
	<p class="text-sm text-base-content/70">Sign up to start using PostPin.</p>
</header>

<div class="space-y-4">
	{#if errorText}
		<div class="alert alert-error" role="alert">{errorText}</div>
	{/if}

	{#if !DISABLE_PASSWORD_LOGIN}
		<form class="space-y-4" onsubmit={handleSignup}>
			<label class="block w-full">
				<span class="mb-1.5 block text-sm font-medium">First name</span>
				<input
					type="text"
					placeholder="Jane"
					class="input w-full"
					autocomplete="given-name"
					required
					bind:value={firstName}
				/>
			</label>

			<label class="block w-full">
				<span class="mb-1.5 block text-sm font-medium">Last name</span>
				<input
					type="text"
					placeholder="Doe"
					class="input w-full"
					autocomplete="family-name"
					bind:value={lastName}
				/>
			</label>

			<label class="block w-full">
				<span class="mb-1.5 block text-sm font-medium">Email</span>
				<input
					type="email"
					placeholder="you@example.com"
					class="input w-full"
					autocomplete="email"
					required
					bind:value={email}
				/>
			</label>

			<label class="block w-full">
				<span class="mb-1.5 block text-sm font-medium">Password</span>
				<input
					type="password"
					placeholder="At least 8 characters"
					class="input w-full"
					autocomplete="new-password"
					minlength="8"
					required
					bind:value={password}
				/>
			</label>

			<button type="submit" class="btn w-full btn-primary" disabled={isLoading}>
				{#if isLoading}
					<span class="loading loading-md loading-spinner"></span>
				{:else}
					Sign up
				{/if}
			</button>
		</form>

		{#if data.providers.length > 0}
			<div class="divider my-2 text-xs text-base-content/60">OR</div>
		{/if}
	{:else if data.providers.length === 0}
		<p class="text-center text-sm text-base-content/70">
			Sign-up is turned off on this PostPin instance.
		</p>
	{/if}

	<SsoButtons
		providers={data.providers}
		callbackURL={safeRedirect(page.url.searchParams.get("redirect"))}
		newUserCallbackURL={redirectTo}
		onerror={(message) => (errorText = message)}
	/>

	{#if TERMS_URL || PRIVACY_URL}
		<p class="text-center text-xs text-base-content/60">
			{#if TERMS_URL}
				By signing up, you agree to the
				<a class="link" href={TERMS_URL} target="_blank" rel="noopener">Terms of Service</a
				>{#if DPA_URL}
					and, for organizations you create or manage, the
					<a class="link" href={DPA_URL} target="_blank" rel="noopener">Data Processing Agreement</a
					>{/if}.
			{/if}
			{#if PRIVACY_URL}
				Learn how we handle your data in the
				<a class="link" href={PRIVACY_URL} target="_blank" rel="noopener">Privacy Policy</a>.
			{/if}
		</p>
	{/if}
</div>

<p class="text-center text-sm text-base-content/70">
	Already have an account? <a class="link link-primary" href={`/auth/login${authQuery}`}>Log in</a>
</p>
