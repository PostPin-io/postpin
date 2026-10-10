<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";

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
					alert("If an account exists for that email, a reset link has been sent.");
					isLoading = false;
				},
				onError: (ctx) => {
					alert(ctx.error.message);
					isLoading = false;
				},
			},
		);
	}
</script>

<h1>Reset Password</h1>

<form
	onsubmit={(event) => {
		event.preventDefault();
		handleResetPassword();
	}}
>
	<label>
		Email
		<input type="email" placeholder="you@example.com" bind:value={email} required />
	</label>

	<button type="submit" disabled={isLoading}>
		{isLoading ? "Sending reset link..." : "Send reset link"}
	</button>
</form>

Back to login:<a href="/auth/login">Login</a>

<style>
	button {
		margin-top: 12px;
		padding: 8px 16px;
		cursor: pointer;
	}
</style>
