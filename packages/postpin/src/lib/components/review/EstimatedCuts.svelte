<script lang="ts">
	// The cuts of a web upload: estimated from the picture, then the team picks how sensitive the cut
	// detection splits the video into shots, or from the editing software's timeline data. Either
	// way, timeline data (EDL, FCPXML) can be imported here later: a new timeline, or markers.
	import FileText from "@lucide/svelte/icons/file-text";
	import Scissors from "@lucide/svelte/icons/scissors";
	import { CUT_LEVEL_LABELS, type CutLevel } from "@postpin-io/shared/logic/web-upload";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import { tick } from "svelte";
	import { CUT_LIST_FORMATS, iconDrop, importedMarkersText } from "#lib/upload/cut-list-file.ts";
	import { setCutSensitivity } from "./cuts.remote.ts";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import TimelineDataImport, {
		type ImportMode,
		type ImportResult,
	} from "./TimelineDataImport.svelte";

	interface Props {
		exportId: string;
		cutLevel: CutLevel;
		/** The cut detection ran, so its scores can be cut at another level */
		detected: boolean;
		canChange: boolean;
		/** May write markers, so may import them */
		canImportMarkers: boolean;
		/** The tracks come from the cut list uploaded with the video; nothing is estimated then */
		cutsFrom: "edl" | "fcpxml" | null;
		clipCount: number;
		trackCount: number;
		/** A cut list came with the video, but the worker couldn't use it: why */
		cutListError: string | null;
		/** The timeline's, to check imported timeline data against before it is sent */
		frameRate: FrameRate;
		/** Markers imported from timeline data, by format */
		importedMarkers: Record<"edl" | "fcpxml", number> | null;
		/** Called after the shots changed; their thumbnails follow a moment later */
		onchanged: () => void | Promise<void>;
	}
	let {
		exportId,
		cutLevel,
		detected,
		canChange,
		canImportMarkers,
		cutsFrom,
		clipCount,
		trackCount,
		cutListError,
		frameRate,
		importedMarkers,
		onchanged,
	}: Props = $props();
	const markersText = $derived(importedMarkersText(importedMarkers));
	const FORMATS = CUT_LIST_FORMATS;
	/** What may be imported: a new timeline needs the upload right, markers the marker one */
	const importModes = $derived<ImportMode[]>([
		...(canChange ? (["tracks"] as const) : []),
		...(canImportMarkers ? (["markers"] as const) : []),
	]);

	// A file dropped on the icon opens the window and is imported right away
	let details: HTMLDetailsElement | null = $state(null);
	let importer: ReturnType<typeof TimelineDataImport> | null = $state(null);
	let iconDragging = $state(false);
	const onIcon = iconDrop({
		enabled: () => importModes.length > 0,
		ondragging: (d) => (iconDragging = d),
		ondropped: async (read) => {
			imported = null;
			if (details) details.open = true;
			await tick();
			await importer?.importFrom(read);
		},
	});
	const iconClass = $derived(
		`btn gap-1 btn-ghost btn-xs ${iconDragging ? "btn-active outline-2 outline-primary outline-dashed" : ""}`,
	);

	/** After an import the window only says so; it starts over once it is opened again */
	let imported = $state<ImportResult | null>(null);
	const resetOnClose = (e: Event) => {
		if (!(e.currentTarget as HTMLDetailsElement).open) imported = null;
	};

	const LEVELS = ["sensitive", "medium", "insensitive", "none"] as const;
	let saving = $state<CutLevel | null>(null);
	let error = $state<string | null>(null);

	async function choose(level: CutLevel) {
		if (level === cutLevel || saving) return;
		saving = level;
		error = null;
		try {
			await setCutSensitivity({ exportId, level });
			await onchanged();
		} catch (e) {
			error = (e as { body?: { message?: string } })?.body?.message ?? "Could not change the cuts";
		} finally {
			saving = null;
		}
	}
</script>

{#snippet importedView(result: ImportResult)}
	<div class="flex flex-col items-center gap-2 py-3 text-center" role="status">
		<CircleCheck size={32} class="text-success" />
		<p class="font-semibold">{result.title}</p>
		<p class="text-xs text-base-content/60">{result.detail}</p>
		<button type="button" class="btn mt-1 btn-ghost btn-xs" onclick={() => (imported = null)}>
			Back
		</button>
	</div>
{/snippet}

{#snippet importZone()}
	{#if importModes.length > 0}
		<!-- not on phones, like the import itself -->
		<div class="mt-3 border-t border-base-300 pt-3 max-sm:hidden">
			<TimelineDataImport
				bind:this={importer}
				{exportId}
				{frameRate}
				modes={importModes}
				replaces={!!cutsFrom}
				{onchanged}
				onimported={(result) => (imported = result)}
			/>
		</div>
	{/if}
{/snippet}

<!-- One window for both: after a new timeline it stays open and says so, with the other icon -->
<details class="dropdown dropdown-end dropdown-top" ontoggle={resetOnClose} bind:this={details}>
	{#if cutsFrom}
		<summary
			class={iconClass}
			{...onIcon}
			title="The timeline comes from the {FORMATS[cutsFrom]} uploaded with the video"
			aria-label="Timeline from the {FORMATS[cutsFrom]}"
		>
			<FileText size={14} />
		</summary>
	{:else}
		<summary
			class={iconClass}
			{...onIcon}
			title="The timeline and its cuts are estimated from the video"
			aria-label="Estimated cuts"
		>
			<Scissors size={14} />
			{#if cutListError}<span class="size-1.5 rounded-full bg-warning"></span>{/if}
		</summary>
	{/if}
	<div class="dropdown-content z-20 mb-2 w-72 rounded-box bg-base-100 p-3 text-sm shadow-lg">
		{#if imported}
			{@render importedView(imported)}
		{:else if cutsFrom}
			<p class="font-semibold">Import Timeline or Markers</p>
			<p class="mt-1 text-xs text-base-content/60">
				{clipCount}
				{clipCount === 1 ? "video clip" : "video clips"} on {trackCount}
				{trackCount === 1 ? "track" : "tracks"}{#if markersText}
					· {markersText.count}{/if}
			</p>
			{@render importZone()}
		{:else}
			<p class="mb-2 font-semibold">Estimate Cuts</p>
			{#if markersText}
				<p class="-mt-1 mb-2 text-xs text-base-content/60">
					{markersText.title}: {markersText.count}
				</p>
			{/if}
			{#if cutListError}
				<p class="mb-2 text-xs text-warning" role="status">
					Timeline data not used: {cutListError}
				</p>
			{/if}

			{#if canChange}
				<div class="join w-full" role="radiogroup" aria-label="Cut sensitivity">
					{#each LEVELS as level (level)}
						<button
							type="button"
							role="radio"
							aria-checked={level === cutLevel}
							class="btn join-item flex-1 px-1 btn-xs"
							class:btn-active={level === cutLevel}
							disabled={!!saving || (!detected && level !== "none")}
							onclick={() => void choose(level)}
						>
							{#if saving === level}<span class="loading loading-xs loading-spinner"></span>{/if}
							{CUT_LEVEL_LABELS[level]}
						</button>
					{/each}
				</div>
				{#if !detected}
					<p class="mt-2 text-xs text-base-content/60">Cut detection was off.</p>
				{/if}
			{/if}
			{#if error}
				<p class="mt-2 text-xs text-error" role="alert">{error}</p>
			{/if}
			{@render importZone()}
		{/if}
	</div>
</details>
