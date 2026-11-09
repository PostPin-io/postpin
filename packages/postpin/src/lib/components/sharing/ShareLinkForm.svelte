<script lang="ts">
	import { untrack } from "svelte";
	import { NOTE_MAX_LENGTH, SHARE_LINK_PRESET_IDS } from "@postpin-io/shared/logic/share-links";
	import { PRESET_LABELS, type ShareLinkFormValues } from "./shareLinks.ts";

	interface Props {
		initial: ShareLinkFormValues;
		/** Offers "Keep current" for the expiry */
		editing?: boolean;
		submitLabel: string;
		busy?: boolean;
		onsubmit: (values: ShareLinkFormValues) => void;
		oncancel?: () => void;
	}
	let { initial, editing = false, submitLabel, busy = false, onsubmit, oncancel }: Props = $props();

	// Copied once: the form edits its own copy until it is submitted
	let values = $state(untrack(() => ({ ...initial })));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		onsubmit($state.snapshot(values));
	}
</script>

<form class="flex flex-col gap-3" onsubmit={submit}>
	<div class="flex flex-wrap gap-6">
		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<input type="checkbox" class="toggle toggle-sm" bind:checked={values.markerPanelVisible} />
			Marker panel
		</label>
		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<input type="checkbox" class="toggle toggle-sm" bind:checked={values.timelinePanelVisible} />
			Timeline panel
		</label>
	</div>

	<label class="flex flex-col gap-1 text-sm">
		<span>Expires after</span>
		<select class="select w-full select-sm" bind:value={values.preset} disabled={busy}>
			{#if editing}<option value={null}>Keep current</option>{/if}
			{#each SHARE_LINK_PRESET_IDS as id (id)}
				<option value={id}>{PRESET_LABELS[id]}{editing ? " from now" : ""}</option>
			{/each}
		</select>
	</label>

	<label class="flex flex-col gap-1 text-sm">
		<span>Note <span class="text-base-content/50">(optional)</span></span>
		<textarea
			class="textarea w-full textarea-sm"
			rows="3"
			maxlength={NOTE_MAX_LENGTH}
			placeholder="Shown in the player and added to the e-mail"
			bind:value={values.note}
			disabled={busy}></textarea>
		<span class="self-end text-xs text-base-content/50">
			{values.note.length} / {NOTE_MAX_LENGTH}
		</span>
	</label>

	<div class="flex justify-end gap-2">
		{#if oncancel}
			<button type="button" class="btn btn-ghost btn-sm" onclick={oncancel} disabled={busy}>
				Cancel
			</button>
		{/if}
		<button class="btn btn-primary btn-sm" disabled={busy}>
			{submitLabel}
			{#if busy}<span class="loading loading-xs loading-spinner"></span>{/if}
		</button>
	</div>
</form>
