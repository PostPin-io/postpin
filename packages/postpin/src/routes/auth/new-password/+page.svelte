<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";

	let newPassword = $state("");
	let isLoading = $state(false);
	let formMessage = $state<{ type: "success" | "error"; text: string } | null>(null);
	let token = $derived(page.url.searchParams.get("token") ?? "");

	async function handleSetPassword() {
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

<svelte:head>
	<title>Choose a new password | PostPin</title>
	//TODO: Add Email meta tag for password reset page

	<meta name="description" content="Choose a new password for your PostPin account." />
</svelte:head>

<main class="flex min-h-[60vh] items-center justify-center py-12">
	<section class="card w-full max-w-md bg-base-100 shadow-xl">
		<div class="card-body gap-6 p-8 sm:p-10">
			<header class="space-y-2 text-center">
				<h1 class="text-3xl font-bold">Choose a new password</h1>
				<p class="text-base-content/70">Enter a new password for your PostPin account.</p>
			</header>

			{#if formMessage}
				<div class="alert" role={formMessage.type === "error" ? "alert" : "status"}>
					<span>{formMessage.text}</span>
					<button
						class="btn btn-ghost btn-sm"
						aria-label="Close message"
						onclick={() => (formMessage = null)}
					>
						×
					</button>
				</div>
			{/if}

			<div class="space-y-4">
				<label class="form-control w-full">
					<span class="label-text mb-2">New Password</span>
					<input
						type="password"
						placeholder="Your new password"
						class="input-bordered input w-full"
						autocomplete="new-password"
						bind:value={newPassword}
					/>
				</label>

				<div class="h-4"></div>

				<button class="btn w-full btn-primary" onclick={handleSetPassword} disabled={isLoading}>
					{isLoading ? "Updating password..." : "Update password"}
				</button>
			</div>

			<p class="text-center text-sm text-base-content/70">
				New to PostPin? <a class="link link-primary" href="/auth/signup">Create an account</a>
			</p>
		</div>
	</section>
</main>
