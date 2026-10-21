<script lang="ts">
	import { MainAPI } from "../ipc/renderer/PostPinResolveAPI";

	let loading = $state(false);
	const DEFAULT_SERVER_URL = "https://postpin.io";
	let serverBaseUrl = $state<string>("");
	let officialServer = $state(true);
	let loginCode = $state<{ userCode: string; verificationUri: string } | null>(null);
	let errorMessage = $state<string | null>(null);

	MainAPI!.onLoginCode!((code) => {
		loginCode = code;
	});

	async function login() {
		serverBaseUrl = officialServer ? DEFAULT_SERVER_URL : serverBaseUrl;
		loading = true;
		errorMessage = null;
		try {
			await MainAPI!.login!({ serverBaseUrl });
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : "Login failed";
			loading = false;
			loginCode = null;
		}
	}

	// codes are 8 characters, shown as "ABCD-EFGH" like on the website
	const formatCode = (code: string) =>
		code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
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
					{formatCode(loginCode.userCode)}
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
