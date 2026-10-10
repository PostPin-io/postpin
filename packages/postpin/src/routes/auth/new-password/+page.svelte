<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { authClient } from "#lib/auth-client.ts";

	let newPassword = $state("");
	let isLoading = $state(false);
	let token = $derived(page.url.searchParams.get("token") ?? "");

	async function handleSetPassword() {
		if (isLoading || !token) return;
		isLoading = true;

		await authClient.resetPassword(
			{ newPassword, token },
			{
				onSuccess: () => {
					alert("Your password has been reset. Please log in with your new password.");
					goto("/auth/login");
				},
				onError: (ctx) => {
					alert(ctx.error.message);
					isLoading = false;
				},
			},
		);
	}
</script>

<h1>Choose a new password</h1>

<form
	onsubmit={(event) => {
		event.preventDefault();
		handleSetPassword();
	}}
>
	<label>
		New password
		<input
			type="password"
			bind:value={newPassword}
			minlength="8"
			autocomplete="new-password"
			required
		/>
	</label>

	<button type="submit" disabled={isLoading}>
		{isLoading ? "Updating password..." : "Update password"}
	</button>
</form>
