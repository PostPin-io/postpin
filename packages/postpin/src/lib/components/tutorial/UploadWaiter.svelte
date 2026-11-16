<script lang="ts">
	// Watches for the first export of the tutorial and says how far it is
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleDashed from "@lucide/svelte/icons/circle-dashed";
	import { uploads } from "#lib/upload/uploads.svelte.ts";

	interface Props {
		export: { id: string; name: string; status: string | null } | null;
		/** The review page of the export */
		href: string | null;
	}
	let { export: exp, href }: Props = $props();

	// a web upload from this browser: its progress is known here, the server only sees PENDING
	const upload = $derived(exp ? uploads.uploads[exp.id] : undefined);
	const percent = $derived(
		upload ? Math.floor((upload.loaded / Math.max(1, upload.size)) * 100) : null,
	);
</script>

<div class="rounded-box border border-base-300 bg-base-200/50 p-4" role="status" aria-live="polite">
	{#if exp?.status === "COMPLETED" && href}
		<div class="flex flex-wrap items-center gap-3">
			<CircleCheck class="size-6 shrink-0 text-success" />
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Your first export is ready!</p>
				<p class="truncate text-sm text-base-content/70">{exp.name}</p>
			</div>
			<a class="btn btn-primary max-sm:w-full" {href}>
				Open your upload
				<ArrowRight size={16} />
			</a>
		</div>
	{:else if exp?.status === "FAILED"}
		<p class="font-semibold text-error">The upload could not be processed.</p>
		<p class="text-sm text-base-content/70">Upload it again; this page picks up the new export.</p>
	{:else if exp}
		<div class="flex items-center gap-3">
			<span class="loading loading-md shrink-0 loading-spinner"></span>
			<div class="min-w-0">
				<p class="font-semibold">
					{#if exp.status === "PROCESSING"}
						Your upload arrived. Preparing it for playback…
					{:else if percent !== null}
						Uploading… {percent}%
					{:else}
						Your upload is on its way…
					{/if}
				</p>
				<p class="truncate text-sm text-base-content/70">{exp.name}</p>
			</div>
		</div>
	{:else}
		<!-- Nothing is running yet: no spinner, or it looks as if an upload had started -->
		<div class="flex items-center gap-3 text-base-content/60">
			<CircleDashed class="size-6 shrink-0" />
			<p>Your first export shows up here as soon as you upload it.</p>
		</div>
	{/if}
</div>
