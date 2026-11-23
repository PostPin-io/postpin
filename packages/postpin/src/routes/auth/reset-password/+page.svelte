<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { authClient } from "#lib/auth-client.ts";
	let formMessage = $state<{ type: "success" | "error"; text: string } | null>(null);

	let isLoading = $state(false);
	let email = $state("");

	async function handleResetPassword(event: SubmitEvent) {
		event.preventDefault();
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

<PageMeta title="Reset Password" description="Reset your PostPin password." />

<header class="space-y-1.5 text-center">
	<h1 class="text-2xl font-semibold">Reset Password</h1>
	<p class="text-sm text-base-content/70">
		Enter your email address and we'll send you a link to reset your password.
	</p>
</header>

<form class="space-y-4" onsubmit={handleResetPassword}>
	{#if formMessage}
		<div
			class="alert"
			class:alert-error={formMessage.type === "error"}
			class:alert-success={formMessage.type === "success"}
			role={formMessage.type === "error" ? "alert" : "status"}
		>
			<span>{formMessage.text}</span>
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				aria-label="Close message"
				onclick={() => (formMessage = null)}
			>
				×
			</button>
		</div>
	{/if}

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

	<button type="submit" class="btn w-full btn-primary" disabled={isLoading}>
		{#if isLoading}
			<span class="loading loading-md loading-spinner"></span>
		{:else}
			Send Reset Link
		{/if}
	</button>
</form>

<p class="text-center text-sm text-base-content/70">
	Remember your password? <a class="link link-primary" href="/auth/login">Log in</a>
</p>
