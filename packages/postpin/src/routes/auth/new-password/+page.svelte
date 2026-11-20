<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import { goto } from "$app/navigation";
	import { getEmail } from "./new-password.remote.ts";
	let newPassword = $state("");
	let isLoading = $state(false);
	let formMessage = $state<{ type: "success" | "error"; text: string } | null>(null);
	let token = $derived(page.url.searchParams.get("token") ?? "");

	async function handleSetPassword(event: SubmitEvent) {
		event.preventDefault();
		if (isLoading || !token) return;

		if (!newPassword.trim()) {
			formMessage = { type: "error", text: "Please enter a new password." };
			return;
		}

		isLoading = true;
		formMessage = null;

		await authClient.resetPassword(
			{ newPassword, token },
			{
				onSuccess: () => {
					formMessage = {
						type: "success",
						text: "Your password has been reset. You can now log in with your new password.",
					};

					isLoading = false;
					goto("/auth/login");
				},
				onError: (ctx) => {
					formMessage = {
						type: "error",
						text: ctx.error.message ?? "Something went wrong while updating your password.",
					};
					isLoading = false;
				},
			},
		);
	}
</script>

<PageMeta
	title="Choose a new password"
	description="Choose a new password for your PostPin account."
/>

<header class="mb-6 space-y-2 text-center">
	<h1 class="text-3xl font-bold">Choose a new password</h1>
	<p class="text-base-content/70">Enter a new password for this account:</p>

	{await getEmail(token)}
</header>

<form class="space-y-4" onsubmit={handleSetPassword}>
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
		<span class="mb-2 block">New Password</span>
		<input
			type="password"
			placeholder="Your new password"
			class="input-bordered input w-full"
			autocomplete="new-password"
			minlength="8"
			required
			bind:value={newPassword}
		/>
	</label>

	<button type="submit" class="btn w-full btn-primary" disabled={isLoading}>
		{#if isLoading}
			<span class="loading loading-md loading-spinner"></span>
		{:else}
			Set New Password
		{/if}
	</button>
</form>

<p class="text-center text-sm text-base-content/70">
	New to PostPin? <a class="link link-primary" href="/auth/signup">Create an account</a>
</p>
