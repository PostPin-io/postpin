<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import Fingerprint from "@lucide/svelte/icons/fingerprint";
	import { isPasskeyCancel } from "#lib/components/auth/passkey-errors.ts";
	import { getSignInMethods } from "./profile.remote.ts";

	type Message = { type: "success" | "error"; text: string } | null;
	type Passkey = { id: string; name: string | null; createdAt: Date | null; backedUp: boolean };

	let { passkeys }: { passkeys: Passkey[] } = $props();

	let adding = $state(false);
	let busyId = $state<string | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state("");
	let message = $state<Message>(null);

	/** "Chrome on macOS"-style default, so a list of passkeys can be told apart */
	function defaultName() {
		const ua = navigator.userAgent;
		const os = /iPhone|iPad/.test(ua)
			? "iOS"
			: /Android/.test(ua)
				? "Android"
				: /Mac OS X/.test(ua)
					? "macOS"
					: /Windows/.test(ua)
						? "Windows"
						: "Linux";
		const browser = /Edg\//.test(ua)
			? "Edge"
			: /Firefox\//.test(ua)
				? "Firefox"
				: /Chrome\//.test(ua)
					? "Chrome"
					: "Safari";
		return `${browser} on ${os}`;
	}

	async function add() {
		adding = true;
		message = null;
		const { error } = await authClient.passkey.addPasskey({ name: defaultName() });
		adding = false;
		if (error) {
			if (!isPasskeyCancel(error)) {
				message = { type: "error", text: error.message ?? "Could not add the passkey." };
			}
			return;
		}
		message = { type: "success", text: "Passkey added. You can now log in with it." };
		await getSignInMethods().refresh();
	}

	async function remove(passkey: Passkey) {
		if (!confirm(`Remove the passkey “${passkey.name ?? "Passkey"}”?`)) return;
		busyId = passkey.id;
		message = null;
		const { error } = await authClient.passkey.deletePasskey({ id: passkey.id });
		busyId = null;
		if (error) {
			message = { type: "error", text: error.message ?? "Could not remove the passkey." };
			return;
		}
		await getSignInMethods().refresh();
	}

	async function rename(event: SubmitEvent, passkey: Passkey) {
		event.preventDefault();
		const name = renameValue.trim();
		if (!name || name === passkey.name) {
			renamingId = null;
			return;
		}
		busyId = passkey.id;
		const { error } = await authClient.passkey.updatePasskey({ id: passkey.id, name });
		busyId = null;
		if (error) {
			message = { type: "error", text: error.message ?? "Could not rename the passkey." };
			return;
		}
		renamingId = null;
		await getSignInMethods().refresh();
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="text-sm font-medium">Passkeys</div>
		<button type="button" class="btn btn-sm" onclick={add} disabled={adding}>
			{#if adding}
				<span class="loading loading-xs loading-spinner"></span>
			{:else}
				<Fingerprint class="size-4" aria-hidden="true" />
			{/if}
			Add passkey
		</button>
	</div>
	<p class="text-xs text-base-content/70">
		Log in with your fingerprint, face or device PIN instead of a password.
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

	{#if passkeys.length > 0}
		<ul class="divide-y divide-base-200">
			{#each passkeys as passkey (passkey.id)}
				<li class="flex items-center justify-between gap-2 py-1.5">
					{#if renamingId === passkey.id}
						<form class="join w-full" onsubmit={(e) => rename(e, passkey)}>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								class="input join-item w-full input-sm"
								aria-label="Passkey name"
								maxlength="100"
								autofocus
								bind:value={renameValue}
								onkeydown={(e) => e.key === "Escape" && (renamingId = null)}
							/>
							<button type="submit" class="btn join-item btn-sm" disabled={busyId === passkey.id}
								>Save</button
							>
						</form>
					{:else}
						<div class="text-sm">
							<div class="font-medium">{passkey.name ?? "Passkey"}</div>
							<div class="text-xs text-base-content/70">
								{#if passkey.createdAt}Added {passkey.createdAt.toLocaleDateString()}{/if}
								{#if passkey.backedUp}· synced{/if}
							</div>
						</div>
						<div class="flex gap-1">
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								onclick={() => {
									renamingId = passkey.id;
									renameValue = passkey.name ?? "";
								}}
							>
								Rename
							</button>
							<button
								type="button"
								class="btn btn-ghost text-error btn-xs"
								disabled={busyId !== null}
								onclick={() => remove(passkey)}
							>
								Remove
								{#if busyId === passkey.id}<span class="loading loading-xs loading-spinner"
									></span>{/if}
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
