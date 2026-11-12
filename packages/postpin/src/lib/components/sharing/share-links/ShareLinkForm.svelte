<script lang="ts">
	import { untrack } from "svelte";
	import Check from "@lucide/svelte/icons/check";
	import X from "@lucide/svelte/icons/x";
	import {
		NOTE_MAX_LENGTH,
		SHARE_LINK_PRESET_IDS,
		type ShareLinkPreset,
	} from "@postpin-io/shared/logic/share-links";
	import PanelLayout from "./PanelLayout.svelte";
	import { remainingTime, type ShareLinkFormValues } from "./share-links.ts";

	interface Props {
		initial: ShareLinkFormValues;
		/** Offers "keep" for the expiry */
		editing?: boolean;
		/** Editing: the link's current expiry, shown on the "keep" option */
		currentExpiresAt?: Date;
		submitLabel: string;
		busy?: boolean;
		onsubmit: (values: ShareLinkFormValues) => void;
		oncancel?: () => void;
	}
	let {
		initial,
		editing = false,
		currentExpiresAt,
		submitLabel,
		busy = false,
		onsubmit,
		oncancel,
	}: Props = $props();

	// Copied once: the form edits its own copy until it is submitted
	let values = $state(untrack(() => ({ ...initial })));

	// null = keep the current expiry (editing only)
	const presets = $derived<(ShareLinkPreset | null)[]>(
		editing ? [null, ...SHARE_LINK_PRESET_IDS] : SHARE_LINK_PRESET_IDS,
	);
	const PRESET_TITLES: Record<ShareLinkPreset, string> = {
		"24h": "24 hours from now",
		"7d": "7 days from now",
		"30d": "30 days from now",
	};
	const current = $derived(currentExpiresAt ? remainingTime(currentExpiresAt) : null);
	// "keep" leaves the expiry as it is; the other options count from now
	const keepLabel = $derived(
		current ? (current.text === "expired" ? "expired" : `${current.text} left`) : "keep",
	);
	const keepTitle = $derived(
		currentExpiresAt
			? `Keep the current expiry (${currentExpiresAt.toLocaleString()}). The other options count from now.`
			: "Keep the current expiry",
	);

	function toggle(part: "timeline" | "markers") {
		if (part === "timeline") values.timelinePanelVisible = !values.timelinePanelVisible;
		else values.markerPanelVisible = !values.markerPanelVisible;
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		onsubmit($state.snapshot(values));
	}
</script>

<form
	class="flex flex-col gap-2.5 rounded-box border-2 border-base-content/50 p-3"
	onsubmit={submit}
>
	<!-- Panels on the left, the note right next to them at the same height -->
	<div class="flex flex-wrap items-stretch gap-3">
		<PanelLayout
			timeline={values.timelinePanelVisible}
			markers={values.markerPanelVisible}
			ontoggle={toggle}
		/>
		<label class="flex min-w-50 flex-1">
			<span class="sr-only">Note</span>
			<textarea
				class="textarea min-h-24 w-full flex-1 resize-none textarea-sm"
				maxlength={NOTE_MAX_LENGTH}
				placeholder="Note: shown in the player and added to the e-mail"
				bind:value={values.note}
				disabled={busy}></textarea>
		</label>
	</div>

	<!-- Slim bar: expiry, note length, cancel and save -->
	<div class="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-2.5">
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<div class="join">
				{#each presets as preset (preset ?? "keep")}
					<button
						type="button"
						class="btn join-item btn-xs {values.preset === preset ? 'btn-neutral' : ''}"
						aria-pressed={values.preset === preset}
						title={preset ? PRESET_TITLES[preset] : keepTitle}
						disabled={busy}
						onclick={() => (values.preset = preset)}
					>
						{preset ?? keepLabel}
					</button>
				{/each}
			</div>
		</div>

		<div class="ml-auto flex shrink-0 items-center gap-2">
			<span class="text-xs whitespace-nowrap text-base-content/50">
				{#if values.note.length}{values.note.length} / {NOTE_MAX_LENGTH}{/if}
			</span>
			{#if oncancel}
				<button
					type="button"
					class="btn btn-square btn-sm"
					title="Cancel"
					aria-label="Cancel"
					disabled={busy}
					onclick={oncancel}
				>
					<X size={16} />
				</button>
			{/if}
			<button
				class="btn btn-square btn-primary btn-sm"
				title={submitLabel}
				aria-label={submitLabel}
				disabled={busy}
			>
				{#if busy}<span class="loading loading-xs loading-spinner"></span>{:else}<Check
						size={16}
					/>{/if}
			</button>
		</div>
	</div>
</form>
