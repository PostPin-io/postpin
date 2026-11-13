<script lang="ts">
	// The cuts of a web upload: estimated from the picture, then the team picks how sensitive the cut
	// detection splits the video into shots, or from the editing software's timeline data. Either
	// way, timeline data (EDL, FCPXML) can be imported here later: a new timeline, or markers.
	import FileText from "@lucide/svelte/icons/file-text";
	import FileUp from "@lucide/svelte/icons/file-up";
	import MapPin from "@lucide/svelte/icons/map-pin";
	import Scissors from "@lucide/svelte/icons/scissors";
	import { CUT_LEVEL_LABELS, type CutLevel } from "@postpin-io/shared/logic/web-upload";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import {
		CUT_LIST_ACCEPT,
		CUT_LIST_FORMATS,
		checkCutListAt,
		cutListSummaryText,
		readCutListFile,
		readDroppedCutList,
		type CutListRead,
	} from "#lib/upload/cut-list-file.ts";
	import { importCutList, setCutSensitivity } from "./cuts.remote.ts";

	interface Props {
		exportId: string;
		cutLevel: CutLevel;
		/** The cut detection ran, so its scores can be cut at another level */
		detected: boolean;
		canChange: boolean;
		/** The tracks come from the cut list uploaded with the video; nothing is estimated then */
		cutsFrom: "edl" | "fcpxml" | null;
		clipCount: number;
		trackCount: number;
		/** A cut list came with the video, but the worker couldn't use it: why */
		cutListError: string | null;
		/** The timeline's, to check imported timeline data against before it is sent */
		frameRate: FrameRate;
		/** Called after the shots changed; their thumbnails follow a moment later */
		onchanged: () => void | Promise<void>;
	}
	let {
		exportId,
		cutLevel,
		detected,
		canChange,
		cutsFrom,
		clipCount,
		trackCount,
		cutListError,
		frameRate,
		onchanged,
	}: Props = $props();
	const FORMATS = CUT_LIST_FORMATS;

	// ─── Importing timeline data ───
	type Mode = "tracks" | "markers";
	let importInput: HTMLInputElement | null = $state(null);
	/** Which button opened the file dialog */
	let pickedMode: Mode = "tracks";
	let importing = $state<Mode | null>(null);
	let dropTarget = $state<Mode | null>(null);
	let imported = $state<{ ok: boolean; text: string } | null>(null);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

	function pick(mode: Mode) {
		pickedMode = mode;
		importInput?.click();
	}

	async function runImport(read: CutListRead | null, mode: Mode) {
		if (!read || importing) return;
		const fail = (text: string) => (imported = { ok: false, text });
		if (!read.ok) return fail(read.error);
		// the video's rate is known: check here, so the answer comes at once
		const check = checkCutListAt(read.list, frameRate);
		if (!check.ok) return fail(check.error);
		if (mode === "tracks" && check.videoClips === 0) return fail(`${read.name} has no video clips`);
		if (mode === "markers" && check.markers === 0) return fail(`${read.name} has no markers`);

		importing = mode;
		imported = null;
		try {
			const res = await importCutList({
				exportId,
				cutList: read.list,
				replaceTracks: mode === "tracks",
			});
			const markers =
				check.markers > 0
					? res.markers === check.markers
						? plural(res.markers, "marker")
						: `${plural(res.markers, "new marker")} (${check.markers - res.markers} already there)`
					: null;
			imported = {
				ok: true,
				text:
					mode === "tracks"
						? `Timeline from ${read.name}: ${cutListSummaryText(check)}${markers ? `; ${markers} added` : ""}`
						: `${markers} added from ${read.name}`,
			};
			await onchanged();
		} catch (e) {
			fail((e as { body?: { message?: string } })?.body?.message ?? "The import failed");
		} finally {
			importing = null;
		}
	}

	const dropHandlers = (mode: Mode) => ({
		ondragenter: (e: DragEvent) => {
			e.preventDefault();
			dropTarget = mode;
		},
		ondragover: (e: DragEvent) => e.preventDefault(),
		ondragleave: () => (dropTarget = null),
		ondrop: async (e: DragEvent) => {
			e.preventDefault();
			dropTarget = null;
			await runImport(await readDroppedCutList(e.dataTransfer), mode);
		},
	});

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

{#snippet importSection()}
	{#if canChange}
		<div class="mt-3 border-t border-base-300 pt-3">
			<p class="mb-1.5 text-xs font-medium tracking-wide text-base-content/60 uppercase">
				Timeline data
			</p>
			<div class="flex flex-col gap-1">
				{#each [{ mode: "tracks" as const, label: cutsFrom ? "Replace the timeline" : "Import a timeline", hint: "Tracks, cuts and markers of an EDL or FCPXML; replaces the clips" }, { mode: "markers" as const, label: "Import markers", hint: "Only the markers of an EDL or FCPXML; the clips stay" }] as action (action.mode)}
					<button
						type="button"
						class="btn justify-start gap-2 btn-sm {dropTarget === action.mode
							? 'btn-active outline-2 outline-base-content/30 outline-dashed'
							: 'btn-ghost'}"
						title={action.hint}
						disabled={!!importing}
						onclick={() => pick(action.mode)}
						{...dropHandlers(action.mode)}
					>
						{#if importing === action.mode}
							<span class="loading loading-xs loading-spinner"></span>
						{:else if action.mode === "tracks"}
							<FileUp size={14} />
						{:else}
							<MapPin size={14} />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
			<p class="mt-1 text-xs text-base-content/50">
				EDL or FCPXML; drop a .fcpxmld bundle onto a button.
			</p>
			{#if imported}
				<p class="mt-2 text-xs {imported.ok ? 'text-success' : 'text-error'}" role="status">
					{imported.text}
				</p>
			{/if}
			<input
				bind:this={importInput}
				type="file"
				class="hidden"
				accept={CUT_LIST_ACCEPT}
				onchange={async (e) => {
					const file = e.currentTarget.files?.[0];
					e.currentTarget.value = "";
					if (file) await runImport(await readCutListFile(file), pickedMode);
				}}
			/>
		</div>
	{/if}
{/snippet}

{#if cutsFrom}
	<details class="dropdown dropdown-end dropdown-top">
		<summary
			class="btn gap-1 btn-ghost btn-xs"
			title="The timeline comes from the {FORMATS[cutsFrom]} uploaded with the video"
			aria-label="Timeline from the {FORMATS[cutsFrom]}"
		>
			<FileText size={14} />
		</summary>
		<div class="dropdown-content z-20 mb-2 w-72 rounded-box bg-base-100 p-3 text-sm shadow-lg">
			<p class="font-semibold">Timeline from the {FORMATS[cutsFrom]}</p>
			<p class="mt-1 text-base-content/70">
				{clipCount}
				{clipCount === 1 ? "video clip" : "video clips"} on {trackCount}
				{trackCount === 1 ? "track" : "tracks"}, from the {FORMATS[cutsFrom]} uploaded with the video.
			</p>
			{@render importSection()}
		</div>
	</details>
{:else}
	<details class="dropdown dropdown-end dropdown-top">
		<summary
			class="btn gap-1 btn-ghost btn-xs"
			title="The timeline and its cuts are estimated from the video"
			aria-label="Estimated cuts"
		>
			<Scissors size={14} />
			{#if cutListError}<span class="size-1.5 rounded-full bg-warning"></span>{/if}
		</summary>
		<div class="dropdown-content z-20 mb-2 w-72 rounded-box bg-base-100 p-3 text-sm shadow-lg">
			<p class="mb-2 font-semibold">Estimate Cuts</p>
			{#if cutListError}
				<p class="mb-2 text-xs text-warning" role="status">
					The timeline data uploaded with the video couldn't be used: {cutListError}.
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
					<p class="mt-2 text-xs text-base-content/60">
						Cut detection was turned off for this upload.
					</p>
				{/if}
			{/if}
			{#if error}
				<p class="mt-2 text-xs text-error" role="alert">{error}</p>
			{/if}
			{@render importSection()}
		</div>
	</details>
{/if}
