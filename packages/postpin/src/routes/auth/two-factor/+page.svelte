<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { authClient } from "#lib/auth-client.ts";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { safeRedirect } from "#lib/redirect.ts";

	const redirectTo = safeRedirect(page.url.searchParams.get("redirect"));

	let useBackupCode = $state(false);
	let code = $state("");
	let trustDevice = $state(false);
	let isLoading = $state(false);
	let errorText = $state<string | null>(null);

	async function verify(event: SubmitEvent) {
		event.preventDefault();
		if (isLoading) return;
		isLoading = true;
		errorText = null;

		const input = { code: code.replace(/\s/g, ""), trustDevice };
		const { error } = useBackupCode
			? await authClient.twoFactor.verifyBackupCode(input)
			: await authClient.twoFactor.verifyTotp(input);

		if (error) {
			isLoading = false;
			// the 2FA cookie lives 10 minutes; after that only a new login helps. A wrong code is a
			// 401 as well, so tell them apart by the code
			errorText =
				"code" in error && error.code === "INVALID_TWO_FACTOR_COOKIE"
					? "This login expired. Please log in again."
					: (error.message ?? "That code didn't work.");
			return;
		}
		goto(redirectTo);
	}

	function switchMethod() {
		useBackupCode = !useBackupCode;
		code = "";
		errorText = null;
	}
</script>

<PageMeta
	title="Two-factor authentication"
	description="Confirm your login with a second factor."
/>

<header class="mb-6 space-y-2 text-center">
	<h1 class="text-3xl font-bold">Two-factor authentication</h1>
	<p class="text-base-content/70">
		{#if useBackupCode}
			Enter one of the backup codes you saved when you turned on two-factor authentication.
		{:else}
			Enter the 6-digit code from your authenticator app.
		{/if}
	</p>
</header>

<form class="space-y-4" onsubmit={verify}>
	{#if errorText}
		<div class="alert alert-error" role="alert">
			<span>
				{errorText}
				{#if errorText.startsWith("This login expired")}
					<a class="link" href={`/auth/login${page.url.search}`}>Log in</a>
				{/if}
			</span>
		</div>
	{/if}

	<label class="block w-full">
		<span class="mb-2 block">{useBackupCode ? "Backup code" : "Code"}</span>
		{#if useBackupCode}
			<input
				type="text"
				class="input-bordered input w-full font-mono"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				required
				bind:value={code}
			/>
		{:else}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				inputmode="numeric"
				pattern="[0-9 ]*"
				maxlength="7"
				placeholder="123 456"
				class="input-bordered input w-full text-center font-mono text-lg tracking-widest"
				autocomplete="one-time-code"
				autofocus
				required
				bind:value={code}
			/>
		{/if}
	</label>

	<label class="flex cursor-pointer items-center gap-2">
		<input type="checkbox" class="checkbox checkbox-sm" bind:checked={trustDevice} />
		<span class="text-sm">Trust this device for 30 days</span>
	</label>

	<button type="submit" class="btn w-full btn-primary" disabled={isLoading}>
		{#if isLoading}
			<span class="loading loading-md loading-spinner"></span>
		{:else}
			Verify
		{/if}
	</button>
</form>

<p class="text-center text-sm text-base-content/70">
	<button type="button" class="link link-hover" onclick={switchMethod}>
		{useBackupCode ? "Use your authenticator app instead" : "Lost your device? Use a backup code"}
	</button>
</p>
