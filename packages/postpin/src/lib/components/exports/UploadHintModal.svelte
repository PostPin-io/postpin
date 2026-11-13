<script lang="ts">
	// Shown before the web upload: the plugins upload the real timeline, so they come first
	import Download from "@lucide/svelte/icons/download";
	import Upload from "@lucide/svelte/icons/upload";
	import X from "@lucide/svelte/icons/x";

	const DOWNLOADS_URL = "https://docs.postpin.io/downloads";

	interface Props {
		/** "I want to upload manually" */
		onmanual: () => void;
	}
	let { onmanual }: Props = $props();

	let dialog: HTMLDialogElement | null = null;

	export function open() {
		dialog?.showModal();
	}
</script>

<dialog class="modal modal-bottom sm:modal-middle" bind:this={dialog}>
	<div class="modal-box max-h-[90dvh]">
		<div class="flex items-start gap-2">
			<h3 class="flex-1 text-lg font-bold">We recommend uploading via the plugin</h3>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X size={16} />
			</button>
		</div>
		<p class="mt-3 text-sm text-base-content/80">
			The PostPin plugins upload the real timeline with your export: its clips, names and timecode.
			Markers travel back into your editing software too.
		</p>
		<p class="mt-2 text-sm text-base-content/70">
			A video uploaded here gets an estimated timeline instead: the cuts are detected from the
			picture.
		</p>

		<div class="modal-action flex-col-reverse gap-2 sm:flex-row">
			<button
				type="button"
				class="btn btn-ghost max-sm:w-full"
				onclick={() => {
					dialog?.close();
					onmanual();
				}}
			>
				<Upload size={16} />
				I want to upload manually
			</button>
			<a
				class="btn btn-primary max-sm:w-full"
				href={DOWNLOADS_URL}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => dialog?.close()}
			>
				<Download size={16} />
				Download plugins
			</a>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
