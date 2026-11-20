<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import type { Capabilities, Settings } from "../bridge";
	import RenderToDisk from "./RenderToDisk.svelte";

	// The settings of the extra render to disk, next to the upload
	interface Props {
		capabilities: Capabilities;
		settings: Settings;
		/** why the disk render can't run like this, shown until it's fixed */
		problem: string | null;
		/** the settings changed, e.g. to save them */
		onClose: () => void;
	}

	let { capabilities, settings = $bindable(), problem, onClose }: Props = $props();

	let dialog: HTMLDialogElement | null = null;
	// RenderToDisk loads the presets when it shows, so it only exists while the dialog is open
	let isOpen = $state(false);

	export function open() {
		isOpen = true;
		dialog?.showModal();
	}
</script>

<dialog
	class="modal"
	bind:this={dialog}
	onclose={() => {
		isOpen = false;
		onClose();
	}}
>
	<div class="modal-box max-w-lg">
		<div class="flex items-center justify-between pb-2">
			<h3 class="text-lg font-bold">Render to disk</h3>
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X />
			</button>
		</div>
		{#if isOpen}
			<RenderToDisk {capabilities} bind:settings />
		{/if}
		{#if problem}
			<p class="pt-2 text-sm text-warning">{problem}</p>
		{/if}
		<div class="modal-action">
			<button type="button" class="btn btn-primary" onclick={() => dialog?.close()}>Done</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
