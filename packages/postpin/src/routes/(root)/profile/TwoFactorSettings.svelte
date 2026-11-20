<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import QRCode from "qrcode";
	import { getSignInMethods } from "./profile.remote.ts";

	type Message = { type: "success" | "error"; text: string } | null;

	let { enabled }: { enabled: boolean } = $props();

	// "password": asks for the password before enable / disable / new backup codes
	// "scan": shows the QR code until the first code confirms it; "codes": shows backup codes once
	let step = $state<"idle" | "password" | "scan" | "codes">("idle");
	let action = $state<"enable" | "disable" | "backup">("enable");
	let password = $state("");
	let code = $state("");
	let qr = $state<string | null>(null);
	let secret = $state<string | null>(null);
	let backupCodes = $state<string[]>([]);
	let busy = $state(false);
	let message = $state<Message>(null);

	function start(next: typeof action) {
		action = next;
		step = "password";
		password = "";
		message = null;
	}

	function reset() {
		step = "idle";
		password = code = "";
		qr = secret = null;
		backupCodes = [];
	}

	async function confirmPassword(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;

		if (action === "enable") {
			const { data, error } = await authClient.twoFactor.enable({ password });
			busy = false;
			// "otp" (codes by email) isn't configured, so a success is always TOTP
			if (error || !data || !("totpURI" in data)) {
				message = { type: "error", text: error?.message ?? "Could not set up two-factor." };
				return;
			}
			backupCodes = data.backupCodes;
			secret = new URL(data.totpURI).searchParams.get("secret");
			qr = await QRCode.toDataURL(data.totpURI, { width: 240, margin: 1 });
			step = "scan";
		} else if (action === "backup") {
			const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
			busy = false;
			if (error || !data) {
				message = { type: "error", text: error?.message ?? "Could not create new codes." };
				return;
			}
			backupCodes = data.backupCodes;
			step = "codes";
		} else {
			const { error } = await authClient.twoFactor.disable({ password });
			busy = false;
			if (error) {
				message = { type: "error", text: error.message ?? "Could not turn off two-factor." };
				return;
			}
			reset();
			message = { type: "success", text: "Two-factor authentication is off." };
			await getSignInMethods().refresh();
		}
	}

	async function confirmCode(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;
		// the first valid code turns 2FA on
		const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
		busy = false;
		if (error) {
			message = { type: "error", text: error.message ?? "That code didn't work." };
			return;
		}
		step = "codes";
		await getSignInMethods().refresh();
	}

	function downloadCodes() {
		const blob = new Blob([`PostPin backup codes\n\n${backupCodes.join("\n")}\n`], {
			type: "text/plain",
		});
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "postpin-backup-codes.txt";
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2 text-sm font-medium">
			Two-factor authentication
			{#if enabled}
				<span class="badge badge-soft badge-sm badge-success">On</span>
			{:else}
				<span class="badge badge-ghost badge-sm">Off</span>
			{/if}
		</div>
		{#if step === "idle"}
			<div class="flex gap-2">
				{#if enabled}
					<button type="button" class="btn btn-ghost btn-xs" onclick={() => start("backup")}>
						New backup codes
					</button>
					<button
						type="button"
						class="btn btn-ghost text-error btn-xs"
						onclick={() => start("disable")}
					>
						Turn off
					</button>
				{:else}
					<button type="button" class="btn btn-sm" onclick={() => start("enable")}>Turn on</button>
				{/if}
			</div>
		{/if}
	</div>
	<p class="text-xs text-base-content/70">
		Asks for a code from an authenticator app after you log in with your password.
	</p>

	{#if message}
		<div
			class="alert alert-soft py-2 text-sm"
			class:alert-error={message.type === "error"}
			class:alert-success={message.type === "success"}
			role={message.type === "error" ? "alert" : "status"}
		>
			<span>{message.text}</span>
		</div>
	{/if}

	{#if step === "password"}
		<form class="flex flex-col gap-2" onsubmit={confirmPassword}>
			<label class="label" for="two-factor-password">Confirm with your password</label>
			<div class="join w-full">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="two-factor-password"
					type="password"
					class="input join-item w-full input-sm"
					autocomplete="current-password"
					autofocus
					bind:value={password}
					disabled={busy}
				/>
				<button
					type="submit"
					class="btn join-item btn-sm"
					class:btn-primary={action !== "disable"}
					class:btn-error={action === "disable"}
					disabled={busy || !password}
				>
					{action === "enable" ? "Continue" : action === "backup" ? "Create codes" : "Turn off"}
					{#if busy}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			</div>
			<div>
				<button type="button" class="btn btn-ghost btn-xs" onclick={reset}>Cancel</button>
			</div>
		</form>
	{:else if step === "scan"}
		<form class="flex flex-col gap-3" onsubmit={confirmCode}>
			<p class="text-sm">
				Scan this code with an authenticator app (1Password, Google Authenticator, Authy, …), then
				enter the 6-digit code it shows.
			</p>
			{#if qr}
				<img
					src={qr}
					alt="QR code for your authenticator app"
					class="size-48 rounded-box bg-white p-2"
				/>
			{/if}
			{#if secret}
				<details class="text-xs">
					<summary class="cursor-pointer">Can't scan it? Enter the key by hand</summary>
					<code class="mt-1 block font-mono break-all select-all">{secret}</code>
				</details>
			{/if}
			<div class="join w-full max-w-xs">
				<input
					type="text"
					inputmode="numeric"
					pattern="[0-9 ]*"
					maxlength="7"
					placeholder="123 456"
					class="input join-item w-full font-mono tracking-widest input-sm"
					autocomplete="one-time-code"
					aria-label="Code from your authenticator app"
					bind:value={code}
					disabled={busy}
				/>
				<button type="submit" class="btn join-item btn-primary btn-sm" disabled={busy || !code}>
					Turn on
					{#if busy}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			</div>
			<div>
				<button type="button" class="btn btn-ghost btn-xs" onclick={reset}>Cancel</button>
			</div>
		</form>
	{:else if step === "codes"}
		<div class="flex flex-col gap-3">
			<p class="text-sm">
				Save these backup codes somewhere safe. Each one works once, if you lose your authenticator
				app. You won't see them again.
			</p>
			<ul class="grid grid-cols-2 gap-1 rounded-box bg-base-200 p-3 font-mono text-sm">
				{#each backupCodes as backupCode (backupCode)}
					<li class="select-all">{backupCode}</li>
				{/each}
			</ul>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-sm"
					onclick={() => navigator.clipboard.writeText(backupCodes.join("\n"))}
				>
					Copy
				</button>
				<button type="button" class="btn btn-sm" onclick={downloadCodes}>Download</button>
				<button type="button" class="btn btn-primary btn-sm" onclick={reset}>Done</button>
			</div>
		</div>
	{/if}
</div>
