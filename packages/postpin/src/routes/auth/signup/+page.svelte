<script lang="ts">
	import { authClient } from "#lib/auth-client.ts"; //import the auth client
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { safeRedirect } from "#lib/redirect.ts";

	const redirectTo = safeRedirect(page.url.searchParams.get("redirect"));
	// keeps ?redirect= (and the invited email) when switching between login and signup
	const authQuery = page.url.search;

	let firstName = $state("");
	let lastName = $state("");
	let email = $state(page.url.searchParams.get("email") ?? "");
	let password = $state("");

	let isLoading = $state(false);

	let formMessage = $state<{ type: "success" | "error"; text: string } | null>(null);

	async function handleSignup() {
		if (isLoading) return; // Prevent multiple submissions

		isLoading = true;

		console.log("Signing up with:", { firstName, lastName, email, password });

		const { data, error } = await authClient.signUp.email(
			{
				email, // user email address
				password, // user password -> min 8 characters by default
				name: `${firstName} ${lastName}`, // user display name
				callbackURL: redirectTo, // A URL to redirect to after the user verifies their email (optional)
			},
			{
				onRequest: (ctx) => {
					//show loading
				},
				onSuccess: (ctx) => {
					goto(redirectTo);
				},
				onError: (ctx) => {
					// display the error message
					formMessage = {
						type: "error",
						text: ctx.error.message ?? "Something went wrong while signing up.",
					};
					isLoading = false;
				},
			},
		);
	}
</script>

<svelte:head>
	<title>Sign Up | PostPin</title>
	<meta name="description" content="Create a new PostPin account." />
</svelte:head>

<header class="space-y-2 text-center">
	<h1 class="text-3xl font-bold">Create an account</h1>
	<p class="text-base-content/70">Sign up to start using PostPin.</p>
</header>

<div class="space-y-4">
	<label class="form-control w-full">
		<div class="h-4"></div>
		<span class="label-text mb-2">First Name</span>
		<input
			type="text"
			placeholder="First Name"
			class="input-bordered input w-full"
			bind:value={firstName}
		/>
	</label>

	<label class="form-control w-full">
		<span class="label-text mb-2">Last Name</span>
		<input
			type="text"
			placeholder="Last Name"
			class="input-bordered input w-full"
			bind:value={lastName}
		/>
	</label>

	<label class="form-control w-full">
		<span class="label-text mb-2">Email</span>
		<input
			type="email"
			placeholder="you@example.com"
			class="input-bordered input w-full"
			autocomplete="email"
			bind:value={email}
		/>
	</label>

	<label class="form-control w-full">
		<span class="label-text mb-2">Password</span>
		<input
			type="password"
			placeholder="Your password"
			class="input-bordered input w-full"
			autocomplete="current-password"
			bind:value={password}
		/>
	</label>

	<div class="text-right">
		<a class="link text-sm link-hover" href="/auth/reset-password">Forgot password?</a>
	</div>

	{#if formMessage}
		<!-- Display the form message if it exists -->
		<div class="alert alert-error" role="alert">
			{formMessage.text}
		</div>
	{/if}

	<button class="btn w-full btn-primary" onclick={handleSignup} disabled={isLoading}>
		{#if isLoading}
			<span class="loading loading-md loading-spinner"></span>
		{:else}
			Sign Up
		{/if}
	</button>
</div>

<p class="text-center text-sm text-base-content/70">
	Already have an account? <a class="link link-primary" href={`/auth/login${authQuery}`}>Log in</a>
</p>
