<script lang="ts">
	// Dropping a video anywhere on the page starts the web upload: while a file is dragged over the
	// window this covers the page as the drop target, and hands the dropped video to `ondropped`.
	import type { Snippet } from "svelte";
	import CloudUpload from "@lucide/svelte/icons/cloud-upload";
	import { fade } from "svelte/transition";
	import { UPLOAD_EXTENSIONS, UPLOAD_FORMATS_TEXT } from "#lib/upload/inspect-file.ts";

	interface Props {
		/** What happens with the video, under the heading */
		children: Snippet;
		ondropped: (file: File) => void;
		/**
		 * Only for drags that are recognizably a video. For pages with drop targets of their own for
		 * other files (timeline data on the review page), which the overlay would cover otherwise.
		 */
		videoOnly?: boolean;
	}
	let { children, ondropped, videoOnly = false }: Props = $props();

	// During the drag only the MIME types are known, not the names. MXF has none on some systems:
	// it isn't caught then, the upload button still takes it.
	const isVideoType = (type: string) => type.startsWith("video/") || type === "application/mxf";

	let dragging = $state(false);
	let fileCount = $state(1);
	// A drag that started in the page (a thumbnail, a link) is no upload
	let fromPage = false;

	function onWindowDragEnter(e: DragEvent) {
		if (dragging || fromPage || !e.dataTransfer?.types.includes("Files")) return;
		// An open dialog has its own drop targets, and lies above this overlay anyway
		if (document.querySelector("dialog[open]")) return;
		if (videoOnly && ![...e.dataTransfer.items].some((item) => isVideoType(item.type))) return;
		e.preventDefault();
		fileCount = e.dataTransfer.items.length;
		dragging = true;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = [...(e.dataTransfer?.files ?? [])];
		const video = files.find((f) =>
			UPLOAD_EXTENSIONS.some((extension) => f.name.toLowerCase().endsWith(extension)),
		);
		// anything else still opens the upload, which says why it can't be used
		const file = video ?? files[0];
		if (file) ondropped(file);
	}
</script>

<svelte:window
	ondragstart={() => (fromPage = true)}
	ondragend={() => (fromPage = false)}
	ondragenter={onWindowDragEnter}
/>

{#if dragging}
	<!--
		Covers the whole window and its content ignores the pointer, so the only dragleave it gets
		is the file leaving the window (or the drag being cancelled).
	-->
	<div
		role="presentation"
		class="fixed inset-0 z-100 bg-base-100/80 p-3 backdrop-blur-sm md:p-6"
		transition:fade={{ duration: 120 }}
		ondragover={(e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
	>
		<div
			class="pointer-events-none flex size-full flex-col items-center justify-center gap-3 rounded-box border-2 border-dashed border-primary bg-primary/10 px-6 text-center"
		>
			<CloudUpload size={56} class="animate-bounce text-primary motion-reduce:animate-none" />
			<p class="text-2xl font-bold">Drop your video to upload</p>
			<p class="max-w-md text-base-content/70">{@render children()}</p>
			<p class="max-w-md text-sm text-base-content/60">
				{UPLOAD_FORMATS_TEXT}.
				{#if fileCount > 1}One video at a time: the first one is used.{/if}
			</p>
		</div>
	</div>
{/if}
