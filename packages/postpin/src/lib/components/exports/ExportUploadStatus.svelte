<script lang="ts">
	// Where the thumbnail of an export will be: its upload progress, then what the worker does
	import Aperture from "@lucide/svelte/icons/aperture";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import X from "@lucide/svelte/icons/x";
	import { uploads } from "#lib/upload/uploads.svelte.ts";

	interface Props {
		exportId: string;
		media: { status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" } | null;
		processingStep: "processing" | "detecting-cuts" | null;
		/** May continue or cancel the upload */
		canUpload: boolean;
		compact?: boolean;
	}
	let { exportId, media, processingStep, canUpload, compact = false }: Props = $props();

	let fileInput: HTMLInputElement | null = $state(null);
	let resumeError = $state<string | null>(null);
	let cancelling = $state(false);

	const upload = $derived(uploads.uploads[exportId]);
	const running = $derived(upload?.status === "uploading" || upload?.status === "completing");
	const percent = $derived(
		upload ? Math.floor((upload.loaded / Math.max(1, upload.size)) * 100) : 0,
	);
	// read again whenever the list or the upload changes. A cancelled upload keeps its entry until
	// the server aborted it, but it isn't "interrupted" meanwhile
	const stored = $derived(
		media?.status === "PENDING" && !running && upload?.status !== "cancelled"
			? uploads.stored(exportId)
			: undefined,
	);

	async function cancel() {
		resumeError = null;
		cancelling = true;
		try {
			// a failure shows up as the upload's error, see UploadManager.cancel
			await uploads.cancel(exportId);
		} finally {
			cancelling = false;
		}
	}

	async function resume(file: File | undefined) {
		if (!file) return;
		resumeError = null;
		try {
			await uploads.resume(exportId, file);
		} catch (e) {
			resumeError = e instanceof Error ? e.message : "The upload could not be continued";
		} finally {
			if (fileInput) fileInput.value = "";
		}
	}
</script>

<div
	class="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-center {compact
		? 'text-xs'
		: 'text-sm'}"
>
	{#if running && upload}
		<div class="w-full max-w-48" role="status" aria-live="polite">
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="font-medium">
					{upload.status === "completing" ? "Finishing…" : `Uploading ${percent} %`}
				</span>
				{#if canUpload && upload.status === "uploading"}
					<button
						type="button"
						class="btn btn-square btn-ghost btn-xs"
						title="Cancel upload"
						aria-label="Cancel upload"
						onclick={() => void uploads.cancel(exportId)}
					>
						<X size={14} />
					</button>
				{/if}
			</div>
			<progress class="progress w-full progress-primary" value={percent} max="100"></progress>
		</div>
	{:else if media?.status === "PENDING" && stored && canUpload}
		<span class="font-medium text-warning">Upload interrupted</span>
		<div class="flex flex-wrap items-center justify-center gap-1">
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={cancelling}
				onclick={() => fileInput?.click()}
			>
				<RotateCcw size={14} /> Resume
			</button>
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				title="Cancel the upload and delete what was uploaded"
				disabled={cancelling}
				onclick={() => void cancel()}
			>
				{#if cancelling}
					<span class="loading loading-xs loading-spinner"></span>
				{:else}
					<X size={14} />
				{/if}
				Cancel
			</button>
		</div>
		<span class="text-base-content/60">Choose the same file to continue</span>
		<span class="max-w-full truncate text-base-content/50" title={stored.fileName}>
			{stored.fileName}
		</span>
		{#if resumeError || upload?.error}
			<span class="text-error">{resumeError ?? upload?.error}</span>
		{/if}
		<input
			bind:this={fileInput}
			type="file"
			class="hidden"
			onchange={(e) => void resume(e.currentTarget.files?.[0])}
		/>
	{:else if media?.status === "PENDING"}
		<span class="text-base-content/50">Upload incomplete</span>
	{:else if media?.status === "PROCESSING"}
		<span class="flex items-center gap-2 text-base-content/70" role="status">
			<span class="loading loading-xs loading-spinner"></span>
			{processingStep === "detecting-cuts" ? "Detecting cuts" : "Processing"}
		</span>
	{:else if media?.status === "FAILED"}
		<span class="text-error">Processing failed</span>
	{:else}
		<Aperture class="text-base-content/30" />
	{/if}
</div>
