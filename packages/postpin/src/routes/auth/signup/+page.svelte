<script lang="ts">
	import { authClient } from "#lib/auth-client.ts"; //import the auth client
	import { goto } from "$app/navigation";
	let firstName = $state("");
	let lastName = $state("");
	let email = $state("");
	let password = $state("");

	let isLoading = $state(false);

	async function handleSignup() {
		if (isLoading) return; // Prevent multiple submissions
		isLoading = true;

		console.log("Signing up with:", { firstName, lastName, email, password });

		const { data, error } = await authClient.signUp.email(
			{
				email, // user email address
				password, // user password -> min 8 characters by default
				name: `${firstName} ${lastName}`, // user display name
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

<input type="text" placeholder="First Name" bind:value={firstName} />
<input type="text" placeholder="Last Name" bind:value={lastName} />
<input type="email" placeholder="Email" bind:value={email} />
<input type="password" placeholder="Password" bind:value={password} />

<button onclick={handleSignup} disabled={isLoading}>
	{isLoading ? "Signing up..." : "Sign up"}
</button>

Back to login: <a href="/auth/login">Login</a>
