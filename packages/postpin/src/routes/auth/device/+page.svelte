<script lang="ts">
	import { authClient } from "#lib/auth-client.ts"; //import the auth client
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import { DEVICE_CLIENTS } from "#lib/device-clients.ts";

	let { data } = $props();

	const session = authClient.useSession();

	// codes may be shown as "ABCD-EFGH"; the server stores them without dashes
	const normalize = (code: string) => code.trim().replace(/-/g, "").toUpperCase();

	let codeInput = $state(page.url.searchParams.get("user_code") ?? "");
	let userCode = $state<string | null>(null);
	let clientName = $state<string | null>(null);
	let loading = $state(false);
	let accepting = $state(false);
	let denying = $state(false);
	let errorMessage = $state<string | null>(null);
	let success: "accepted" | "denied" | null = $state(null);

	function errorText(error: { message?: string; error_description?: string } | null) {
		return error?.error_description ?? error?.message ?? "Something went wrong.";
	}

	async function verify() {
		const code = normalize(codeInput);
		if (!code || loading) return;
		loading = true;
		errorMessage = null;

		// put a typed-in code into the URL so the load function fetches its device name
		if (page.url.searchParams.get("user_code") !== code) {
			await goto(`?user_code=${encodeURIComponent(code)}`, { replaceState: true });
		}

		// claims the pending code for the current session
		const { data: request, error } = await authClient.device({ query: { user_code: code } });
		if (error) {
			errorMessage =
				error.status === 400 ? "This code is invalid or has expired." : errorText(error);
		} else if (request.status !== "pending") {
			errorMessage = "This code has already been used.";
		} else if (!request.client_id) {
			// client_id is only returned to the account that claimed the code
			errorMessage = "This code belongs to another sign-in.";
		} else {
			userCode = code;
			clientName = DEVICE_CLIENTS[request.client_id] ?? request.client_id;
		}
		loading = false;
	}

	onMount(() => {
		if (codeInput) verify();
	});

	async function accept() {
		if (!userCode || accepting || denying) return;
		accepting = true;
		const { error } = await authClient.device.approve({ userCode });
		accepting = false;
		if (error) errorMessage = errorText(error);
		else success = "accepted";
	}

	async function deny() {
		if (!userCode || accepting || denying) return;
		denying = true;
		const { error } = await authClient.device.deny({ userCode });
		denying = false;
		if (error) errorMessage = errorText(error);
		else success = "denied";
	}

	function reset() {
		userCode = null;
		clientName = null;
		codeInput = "";
		errorMessage = null;
	}
</script>

<svelte:head>
	<title>Connect Device | PostPin</title>
	<meta name="description" content="Connect a device to your PostPin account." />
</svelte:head>

<header class="space-y-2 text-center">
	<h1 class="text-3xl font-bold">Connect a device</h1>
	<p class="text-base-content/70">
		{#if success === "accepted"}
			{clientName}{data.deviceName ? ` on ${data.deviceName}` : ""} is now signed in.
		{:else if success === "denied"}
			The sign-in request was denied.
		{:else if userCode}
			Make sure the code below matches the one shown in the app.
		{:else}
			Enter the code shown on your device.
		{/if}
	</p>
</header>

<div class="space-y-4">
	{#if success === "accepted"}
		<div class="alert alert-success" role="alert">
			You can close this tab and return to the app.
		</div>
	{:else if success === "denied"}
		<div class="alert alert-warning" role="alert">
			The app was not given access. You can close this tab.
		</div>
	{:else if userCode}
		<div class="rounded-box bg-base-200 py-4 text-center">
			<div class="text-xl font-semibold">{clientName}</div>
			{#if data.deviceName}
				<div class="text-sm text-base-content/70">on {data.deviceName}</div>
			{/if}
			<div class="mt-3 font-mono text-2xl tracking-widest">
				{userCode.length === 8 ? `${userCode.slice(0, 4)}-${userCode.slice(4)}` : userCode}
			</div>
		</div>

		<p class="text-center text-sm text-base-content/70">
			This app will get access to your PostPin account
			{#if $session.data}
				<span class="font-semibold">{$session.data.user.email}</span>.
			{/if}
			Only continue if you started this sign-in yourself.
		</p>

		{#if errorMessage}
			<div class="alert alert-error" role="alert">{errorMessage}</div>
		{/if}

		<button class="btn w-full btn-primary" onclick={accept} disabled={accepting || denying}>
			{#if accepting}
				<span class="loading loading-md loading-spinner"></span>
			{:else}
				Allow access
			{/if}
		</button>

		<button class="btn w-full btn-ghost" onclick={deny} disabled={accepting || denying}>
			{#if denying}
				<span class="loading loading-md loading-spinner"></span>
			{:else}
				Deny
			{/if}
		</button>
	{:else}
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				verify();
			}}
		>
			<label class="form-control w-full">
				<span class="label-text mb-2">Device code</span>
				<input
					type="text"
					placeholder="ABCD-EFGH"
					class="input-bordered input w-full font-mono tracking-widest uppercase"
					autocomplete="one-time-code"
					autocapitalize="characters"
					spellcheck="false"
					bind:value={codeInput}
				/>
			</label>

			{#if errorMessage}
				<div class="alert alert-error" role="alert">{errorMessage}</div>
			{/if}

			<button class="btn w-full btn-primary" type="submit" disabled={loading || !codeInput.trim()}>
				{#if loading}
					<span class="loading loading-md loading-spinner"></span>
				{:else}
					Continue
				{/if}
			</button>
		</form>
	{/if}

	{#if userCode && errorMessage && !success}
		<button class="btn w-full btn-link" onclick={reset}>Enter a different code</button>
	{/if}
</div>
