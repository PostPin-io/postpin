<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	let formMessage = $state<{ type: "success" | "error"; text: string } | null>(null);

	let isLoading = $state(false);
	let email = $state("");

	async function handleResetPassword() {
		if (isLoading) return;
		isLoading = true;

		await authClient.requestPasswordReset(
			{
				email,
				redirectTo: "/auth/new-password",
			},
			{
				onSuccess: () => {
					formMessage = {
						type: "success",
						text: "If an account exists for that email, a reset link has been sent.",
					};
					isLoading = false;
				},
				onError: (ctx) => {
					formMessage = {
						type: "error",
						text: ctx.error.message ?? "Something went wrong while requesting a password reset.",
					};
					isLoading = false;
				},
			},
		);
	}
</script>

<svelte:head>
	<title>Reset Password | PostPin</title>
	<meta name="description" content="Reset your PostPin password." />
</svelte:head>

<header class="space-y-2 text-center">
	<h1 class="text-3xl font-bold">Reset Password</h1>
	<p class="text-base-content/70">
		Enter your email address and we'll send you a link to reset your password.
	</p>
</header>

<div class="space-y-4">
	<label class="form-control w-full">
		<div class="h-4"></div>
		<span class="label-text mb-2">Email</span>
		<input
			type="email"
			placeholder="you@example.com"
			class="input-bordered input w-full"
			autocomplete="email"
			bind:value={email}
		/>
	</label>
	<div class="h-4"></div>

	<button class="btn w-full btn-primary" onclick={handleResetPassword} disabled={isLoading}>
		{#if isLoading}
			<span class="loading loading-md loading-spinner"></span>
		{:else}
			Send Reset Link
		{/if}
	</button>
</div>

<p class="text-center text-sm text-base-content/70">
	New to PostPin? <a class="link link-primary" href="/auth/signup">Create an account</a>
</p>
