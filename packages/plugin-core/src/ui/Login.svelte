<script lang="ts">
	import type { LoginCode } from "../bridge";
	import { getBridges } from "./context";
	import { formatLoginCode } from "./format";

	const { host } = getBridges();

	let loading = $state(false);

	// Preselect the server used last time
	const [lastServerUrl, defaultServerUrl] = await Promise.all([
		host.getServerUrl(),
		host.getDefaultServerUrl(),
	]);
	let officialServer = $state(lastServerUrl === defaultServerUrl);
	let serverBaseUrl = $state(lastServerUrl === defaultServerUrl ? "" : lastServerUrl);
	let loginCode = $state<LoginCode | null>(null);
	let errorMessage = $state<string | null>(null);

	async function login() {
		loading = true;
		errorMessage = null;
		try {
			// an empty url makes main use the hosted server of this build
			await host.login(officialServer ? "" : serverBaseUrl, (code) => {
				loginCode = code;
			});
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Login failed";
			loading = false;
			loginCode = null;
		}
	}
</script>

{#if loading}
	<main class="w-screen h-screen flex items-center justify-center">
		{#if loginCode}
			<div class="w-96 bg-base-100 text-center flex flex-col gap-4 p-8 rounded-lg shadow-lg">
				<h2 class="font-bold">Continue in your browser</h2>
				<p class="text-sm text-base-content/70">
					Approve the sign-in in the browser window that just opened. If it didn't open, go to
					<span class="font-semibold break-all">{loginCode.verificationUri}</span> and enter this code:
				</p>
				<div class="rounded-box bg-base-200 py-4 font-mono text-2xl tracking-widest">
					{formatLoginCode(loginCode.userCode)}
				</div>
				<span class="loading loading-md loading-spinner mx-auto"></span>
			</div>
		{:else}
			<span class="loading loading-lg loading-spinner"></span>
		{/if}
	</main>
{:else}
	<main class="w-screen h-screen flex items-center justify-center">
		<div class="w-96 bg-base-100 text-center flex flex-col gap-4 p-8 rounded-lg shadow-lg">
			<h2 class="font-bold">Login to PostPin</h2>
			<p class="text-sm text-base-content/70 mb-2">Welcome to PostPin!</p>

			<label class="label">
				<input type="checkbox" class="toggle" bind:checked={officialServer} />
				Use hosted PostPin server
			</label>

			{#if !officialServer}
				<p class="text-sm text-base-content/70 mb-2">
					You can use your own PostPin server by entering the URL below.
				</p>
				<input
					type="text"
					placeholder="PostPin Server URL"
					class="input input-bordered w-full"
					bind:value={serverBaseUrl}
				/>
			{/if}

			{#if errorMessage}
				<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
			{/if}

			<button class="btn btn-block btn-primary" onclick={login}>Login</button>
		</div>
	</main>
{/if}
