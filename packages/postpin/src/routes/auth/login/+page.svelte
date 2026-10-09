<script lang="ts">
	import { authClient } from "#lib/auth-client.ts"; //import the auth client
	import { goto } from "$app/navigation";

	let email = $state("");
	let password = $state("");

	let isLoading = $state(false);

	async function handleLogin() {
		if (isLoading) return; // Prevent multiple submissions
		isLoading = true;

		console.log("Logging in with:", { email, password });

		const { data, error } = await authClient.signIn.email(
			{
				email, // user email address
				password, // user password -> min 8 characters by default
				callbackURL: "/dashboard", // A URL to redirect to after the user verifies their email (optional)
			},
			{
				onRequest: (ctx) => {
					//show loading
				},
				onSuccess: (ctx) => {
					goto("/dashboard");
				},
				onError: (ctx) => {
					// display the error message
					alert(ctx.error.message);
					isLoading = false;
				},
			},
		);
	}
</script>

<h1>Login</h1>

<input type="email" placeholder="Email" bind:value={email} />
<input type="password" placeholder="Password" bind:value={password} />

<button onclick={handleLogin} disabled={isLoading}>
	{isLoading ? "Logging in..." : "Login"}
</button>
New user? <a href="/auth/signup">Sign up</a>
