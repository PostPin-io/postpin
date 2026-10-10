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

<svelte:head>
	<title>Sign Up | PostPin</title>
	<meta name="description" content="Create a new PostPin account." />
</svelte:head>

<main class="flex min-h-[60vh] items-center justify-center py-12">
	<section class="card w-full max-w-md bg-base-100 shadow-xl">
		<div class="card-body gap-6 p-8 sm:p-10">
			<header class="space-y-2 text-center">
				<h1 class="text-3xl font-bold">Create an account</h1>
				<p class="text-base-content/70">Sign up to start using PostPin.</p>
			</header>

			<div class="space-y-4">
				<label class="form-control w-full">
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

				<button class="btn w-full btn-primary" onclick={handleSignup} disabled={isLoading}>
					{isLoading ? "Signing up..." : "Sign up"}
				</button>
			</div>

			<p class="text-center text-sm text-base-content/70">
				Already have an account? <a class="link link-primary" href="/auth/login">Log in</a>
			</p>
		</div>
	</section>
</main>
