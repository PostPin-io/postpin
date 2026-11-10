<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import Download from "@lucide/svelte/icons/download";
	import QRCode from "qrcode";

	interface Props {
		/** The share URL to show; null closes the modal */
		url: string | null;
		onclose: () => void;
	}
	let { url, onclose }: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	let image = $state<string | null>(null);

	$effect(() => {
		if (!url) {
			dialog?.close();
			return;
		}
		let cancelled = false;
		image = null;
		// 440 px for a sharp 220 px image on high-density screens
		QRCode.toDataURL(url, { width: 440, margin: 1, errorCorrectionLevel: "M" }).then((data) => {
			if (!cancelled) image = data;
		});
		dialog?.showModal();
		return () => {
			cancelled = true;
		};
	});
</script>

<dialog class="modal" bind:this={dialog} {onclose}>
	<div class="modal-box grid w-80 justify-items-center gap-3">
		<div class="flex items-center justify-self-stretch">
			<strong class="flex-1">QR code</strong>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title="Close"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X size={16} />
			</button>
		</div>

		{#if image}
			<img src={image} alt="QR code for the share link" class="size-55 bg-white" />
			<a class="btn btn-ghost btn-xs" href={image} download="postpin-share-link.png">
				<Download size={14} /> Download
			</a>
		{:else}
			<div class="flex size-55 items-center justify-center">
				<span class="loading loading-spinner"></span>
			</div>
		{/if}
		<p class="text-center text-xs break-all text-base-content/60">{url}</p>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
