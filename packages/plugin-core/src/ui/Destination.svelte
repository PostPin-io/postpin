<script lang="ts">
	import type { Snippet } from "svelte";
	import PostPinLogo from "./PostPinLogo.svelte";
	import DestinationSelectionModal from "./DestinationSelectionModal.svelte";
	import Globe from "@lucide/svelte/icons/globe";
	import { getBridges } from "./context";

	interface Props {
		mode: "timeline" | "export";
		title: string;
		// parent locations, e.g. the project name
		path?: string;
		name?: string;
		// shown instead of path and name when nothing is selected
		emptyText: string;
		highlightChoose?: boolean;
		browserUrl?: string;
		children?: Snippet;
		projects: {
			id: string;
			name: string;
			organization?: { id: string; name: string };
			timelines: {
				id: string;
				name: string;
				exports?: {
					id: string;
					name: string;
				}[];
			}[];
		}[];
		// ids of the current destination, preselected in the modal
		selectedProjectId?: string;
		selectedTimelineId?: string;
		selectedExportId?: string;
		// exportId is only set in "export" mode
		onSelect: (projectId: string, timelineId: string, exportId?: string) => void;
	}

	let {
		title,
		path,
		name,
		emptyText,
		mode,
		highlightChoose = false,
		children,
		projects,
		selectedProjectId,
		selectedTimelineId,
		selectedExportId,
		onSelect,
		browserUrl,
	}: Props = $props();

	let modal: DestinationSelectionModal | null = null;

	const { host } = getBridges();
</script>

<section class="flex min-w-0 flex-col gap-2 rounded-box border-2 border-base-content/50 p-4">
	<div class="flex items-center gap-2">
		<PostPinLogo class="h-5 w-auto" />
		<h2 class="text-xs tracking-widest text-base-content/60 uppercase">{title}</h2>
	</div>

	{#if name}
		{#if path}
			<div class="text-sm break-words text-base-content/60">{path}</div>
		{/if}
		<div class="text-lg font-bold break-words">{name}</div>
		{@render children?.()}
	{:else}
		<div
			class="rounded-box border-2 border-dashed border-base-content/30 p-3 text-sm text-base-content/60"
		>
			{emptyText}
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2 text-sm text-base-content/60">
		<button
			type="button"
			class={["btn btn-sm self-start", highlightChoose && "btn-primary"]}
			onclick={() => modal?.open()}
		>
			Choose export
		</button>
		{#if browserUrl}
			<button
				class="btn btn-link btn-xs"
				onclick={() => host.openInBrowser(browserUrl)}
				aria-label="Open in browser"
			>
				<Globe size={14} />
			</button>
		{/if}
	</div>
</section>

<DestinationSelectionModal
	{projects}
	bind:this={modal}
	{mode}
	{selectedProjectId}
	{selectedTimelineId}
	{selectedExportId}
	{onSelect}
/>
