<script lang="ts">
	import Pencil from "@lucide/svelte/icons/pencil";
	import { formatByteSize, isByteSize } from "@postpin-io/shared/logic/bytes";

	let {
		quota,
		quotaOverride,
		save,
	}: {
		/** Effective quota, null = unlimited */
		quota: bigint | null;
		/** null = the ENV default applies */
		quotaOverride: bigint | null;
		save: (quota: string | null) => Promise<unknown>;
	} = $props();

	let editing = $state(false);
	let value = $state("");
	let saving = $state(false);
	let error = $state<string | null>(null);

	function start() {
		value = quotaOverride === null ? "" : formatByteSize(quotaOverride);
		error = null;
		editing = true;
	}

	async function submit() {
		let trimmed = value.trim();
		if (trimmed.match(/^\d+$/)) {
			trimmed += " GB"; // allow bare numbers, treat as gigabytes
		}
		if (trimmed && !isByteSize(trimmed)) {
			error = "Enter a size like 50 GB";
			return;
		}
		saving = true;
		try {
			await save(trimmed || null);
			editing = false;
		} catch (e) {
			error = (e as { body?: { message?: string } }).body?.message ?? (e as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

{#if editing}
	<form
		class="flex flex-col gap-1"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<div class="join">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="input join-item w-32 input-xs"
				bind:value
				placeholder="Default"
				aria-label="Quota, empty for the default"
				autofocus
				disabled={saving}
				onkeydown={(e) => e.key === "Escape" && (editing = false)}
			/>
			<button class="btn join-item btn-primary btn-xs" disabled={saving}>Save</button>
			<button
				type="button"
				class="btn join-item btn-ghost btn-xs"
				disabled={saving}
				onclick={() => (editing = false)}>Cancel</button
			>
		</div>
		{#if error}<span class="text-xs text-error">{error}</span>{/if}
	</form>
{:else}
	<button
		class="nowrap flex link items-center gap-1 text-sm tabular-nums link-hover"
		onclick={start}
		title="Change quota"
	>
		{quota === null ? "Unlimited" : formatByteSize(quota)}
		{#if quotaOverride === null}<span class="opacity-50">(default)</span>{/if}
		<span class="opacity-50">
			<Pencil size={14} />
		</span>
	</button>
{/if}
