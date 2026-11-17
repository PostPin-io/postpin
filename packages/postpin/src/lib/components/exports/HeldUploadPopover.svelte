<script lang="ts">
	// The video dropped on the projects or the timelines, until the user chose where it goes
	import { page } from "$app/state";
	import FileVideoCamera from "@lucide/svelte/icons/file-video-camera";
	import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
	import X from "@lucide/svelte/icons/x";
	import { fly } from "svelte/transition";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import { heldUpload } from "#lib/upload/held-upload.svelte.ts";

	const file = $derived(heldUpload.file);

	const hint = $derived.by(() => {
		switch (page.route.id) {
			case "/(root)/dashboard":
				return { text: "Choose the project for this video.", link: null };
			case "/(root)/projects/[project]":
				return { text: "Choose the timeline to upload it to.", link: null };
			// the export list takes the video at once, unless the user can't upload there
			case "/(root)/projects/[project]/timelines/[timeline]/exports":
				return { text: "You can't upload to this timeline. Choose another one.", link: null };
			default:
				return { text: "Open a project and choose the timeline for it.", link: "/dashboard" };
		}
	});

	function onkeydown(e: KeyboardEvent) {
		// an open dialog handles Escape itself
		if (e.key === "Escape" && file && !document.querySelector("dialog[open]")) heldUpload.clear();
	}
</script>

<svelte:window {onkeydown} />

{#if file}
	<div
		class="fixed bottom-4 left-1/2 z-40 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2"
		role="status"
		aria-live="polite"
		transition:fly={{ y: 16, duration: 150 }}
	>
		<div class="rounded-box border-2 border-warning bg-base-100 p-3 shadow-xl">
			<div class="flex items-center gap-3">
				<div class="flex size-10 shrink-0 items-center justify-center rounded-field bg-base-200">
					<FileVideoCamera size={20} />
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium" title={file.name}>{file.name}</p>
					<p class="text-xs text-base-content/60">{formatByteSize(file.size)} · ready to upload</p>
				</div>
				<button
					type="button"
					class="btn btn-square btn-ghost btn-sm"
					title="Discard the video"
					aria-label="Discard the video"
					onclick={() => heldUpload.clear()}
				>
					<X size={16} />
				</button>
			</div>
			<p
				class="mt-2 flex items-center gap-2 border-t border-warning/30 pt-2 text-sm font-medium text-warning"
			>
				<MousePointerClick size={16} class="shrink-0 text-base-content" />
				{#if hint.link}
					<a class="link" href={hint.link}>{hint.text}</a>
				{:else}
					{hint.text}
				{/if}
			</p>
		</div>
	</div>
{/if}
