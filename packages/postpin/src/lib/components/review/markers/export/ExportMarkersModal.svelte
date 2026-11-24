<script lang="ts">
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import type { VideoSource } from "../../VideoPlayer.svelte";
	import type { ReviewMarker } from "../types.ts";
	import { sortMarkers } from "../marker-list.ts";
	import { FORMATS, type ExportFormat } from "./document.ts";
	import { downloadBlob, safeFileName } from "./download.ts";
	import { openFrameGrabber, type FrameGrabber, type Thumbnail } from "./frame-grabber.ts";
	import { THUMBNAIL_PRESETS, type ThumbnailSize } from "./presets.ts";
	import { toExportRow } from "./rows.ts";

	interface Props {
		/** Every marker of the export */
		markers: ReviewMarker[];
		/** The list as the panel shows it: filtered and sorted */
		panelMarkers: ReviewMarker[];
		selectedIds: string[];
		exportName: string;
		/** Organization, project and timeline names; null for guests */
		location?: { organization: string; project: string; timeline: string } | null;
		frameRate: FrameRate;
		startFrame: number;
		/** What the review plays; without it there are no thumbnails */
		videoSource?: VideoSource;
	}
	let {
		markers,
		panelMarkers,
		selectedIds,
		exportName,
		location = null,
		frameRate,
		startFrame,
		videoSource,
	}: Props = $props();

	const PREFERENCES_KEY = "postpin:marker-export";
	/** All markers by timecode, or the panel's list with its filters and sorting */
	type Scope = "all" | "panel";
	interface Preferences {
		format: ExportFormat;
		thumbnails: boolean;
		size: ThumbnailSize;
		scope: Scope;
	}
	const defaults: Preferences = { format: "pdf", thumbnails: true, size: "M", scope: "all" };

	function loadPreferences(): Preferences {
		try {
			const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
			return {
				format: stored.format in FORMATS ? stored.format : defaults.format,
				thumbnails:
					typeof stored.thumbnails === "boolean" ? stored.thumbnails : defaults.thumbnails,
				size: stored.size in THUMBNAIL_PRESETS ? stored.size : defaults.size,
				scope: stored.scope === "panel" ? "panel" : defaults.scope,
			};
		} catch {
			return defaults;
		}
	}

	function savePreferences() {
		try {
			localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ format, thumbnails, size, scope }));
		} catch {
			// private mode or blocked storage: the choice just isn't remembered
		}
	}

	const initial = loadPreferences();
	let format = $state<ExportFormat>(initial.format);
	let thumbnails = $state(initial.thumbnails);
	let size = $state<ThumbnailSize>(initial.size);
	let scope = $state<Scope>(initial.scope);
	let onlySelected = $state(false);

	const byTimecode = $derived(sortMarkers(markers, "timecode", "asc"));
	// Selected markers in the panel's order, like the list they were picked from
	const selected = $derived(panelMarkers.filter((m) => selectedIds.includes(m.id)));
	const canChooseSelected = $derived(selected.length > 1);
	const list = $derived(
		onlySelected && canChooseSelected ? selected : scope === "all" ? byTimecode : panelMarkers,
	);
	// CSV is text only: the choice stays for the next PDF or Excel
	const canHaveThumbnails = $derived(FORMATS[format].pictures && !!videoSource);
	const withThumbnails = $derived(thumbnails && canHaveThumbnails);

	type Progress =
		| { kind: "idle" }
		| { kind: "grabbing"; done: number; total: number }
		| { kind: "building" }
		| { kind: "error"; message: string };
	let progress = $state<Progress>({ kind: "idle" });
	const busy = $derived(progress.kind === "grabbing" || progress.kind === "building");

	let dialog: HTMLDialogElement | null = $state(null);
	let abort: AbortController | null = null;

	export function open() {
		progress = { kind: "idle" };
		// Several selected markers: those are most likely what is meant
		onlySelected = selected.length > 1;
		dialog?.showModal();
	}

	function cancel() {
		abort?.abort();
		abort = null;
		progress = { kind: "idle" };
	}

	async function run(event: SubmitEvent) {
		event.preventDefault();
		if (busy || list.length === 0) return;
		savePreferences();

		const controller = new AbortController();
		abort = controller;
		const markersToExport = list;
		const preset = THUMBNAIL_PRESETS[size];
		let grabber: FrameGrabber | null = null;
		try {
			let grabbed: (Thumbnail | null)[] | null = null;
			if (withThumbnails && videoSource) {
				progress = { kind: "grabbing", done: 0, total: markersToExport.length };
				grabber = await openFrameGrabber(
					videoSource,
					{ frameRate, startFrameIndex: startFrame },
					preset.grabPx,
				);
				grabbed = [];
				for (const marker of markersToExport) {
					if (controller.signal.aborted) return;
					// One frame that fails doesn't fail the export: its cell stays empty
					grabbed.push(await grabber.grab(marker).catch(() => null));
					progress = { kind: "grabbing", done: grabbed.length, total: markersToExport.length };
				}
			}
			if (controller.signal.aborted) return;

			progress = { kind: "building" };
			const count = `${markersToExport.length} marker${markersToExport.length === 1 ? "" : "s"}`;
			const exportDocument = {
				title: exportName,
				location: location ? [location.organization, location.project, location.timeline] : [],
				details: `${count} · Exported ${new Date().toLocaleString()}`,
				rows: markersToExport.map((marker) => toExportRow(marker, frameRate)),
				thumbnails: grabbed,
				size,
			};
			const blob =
				format === "pdf"
					? await (await import("./pdf.ts")).buildPdf(exportDocument)
					: format === "xlsx"
						? await (await import("./xlsx.ts")).buildXlsx(exportDocument)
						: (await import("./csv.ts")).buildCsv(exportDocument);
			if (controller.signal.aborted) return;

			downloadBlob(blob, `${safeFileName(exportName)} - Markers.${FORMATS[format].extension}`);
			progress = { kind: "idle" };
			dialog?.close();
		} catch (error) {
			if (!controller.signal.aborted) {
				progress = { kind: "error", message: (error as Error).message || "Export failed" };
			}
		} finally {
			grabber?.close();
			if (abort === controller) abort = null;
		}
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={cancel}>
	<form class="modal-box flex max-w-md flex-col gap-4" onsubmit={run}>
		<h2 class="text-lg font-semibold">Export markers</h2>

		<fieldset class="fieldset" disabled={busy}>
			<legend class="fieldset-legend">Format</legend>
			<div class="join">
				{#each Object.entries(FORMATS) as [value, { label }] (value)}
					<input
						type="radio"
						name="format"
						class="btn join-item btn-sm"
						aria-label={label}
						{value}
						bind:group={format}
					/>
				{/each}
			</div>
		</fieldset>

		<fieldset class="fieldset" disabled={busy}>
			<legend class="fieldset-legend">Thumbnails</legend>
			<label class="label">
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={withThumbnails}
					onchange={(event) => (thumbnails = event.currentTarget.checked)}
					disabled={!canHaveThumbnails}
				/>
				Frame with its pointers
			</label>
			{#if !FORMATS[format].pictures}
				<p class="label text-xs">{FORMATS[format].label} has no pictures.</p>
			{:else if !videoSource}
				<p class="label text-xs">The video isn't ready yet.</p>
			{/if}
			<div class="join mt-1">
				{#each Object.entries(THUMBNAIL_PRESETS) as [value, { label }] (value)}
					<input
						type="radio"
						name="size"
						class="btn join-item btn-sm"
						aria-label={label}
						{value}
						bind:group={size}
						disabled={!withThumbnails}
					/>
				{/each}
			</div>
			{#if withThumbnails && format === "pdf"}
				<p class="label text-xs">
					{THUMBNAIL_PRESETS[size].perPage} markers per page, the frames as large as that allows
				</p>
			{/if}
		</fieldset>

		<fieldset class="fieldset" disabled={busy}>
			<legend class="fieldset-legend">Markers</legend>
			<label class="label">
				<input
					type="radio"
					name="scope"
					class="radio radio-sm"
					checked={!onlySelected && scope === "all"}
					onchange={() => ((scope = "all"), (onlySelected = false))}
				/>
				All, by timecode ({markers.length})
			</label>
			<label class="label">
				<input
					type="radio"
					name="scope"
					class="radio radio-sm"
					checked={!onlySelected && scope === "panel"}
					onchange={() => ((scope = "panel"), (onlySelected = false))}
				/>
				As in the panel: its filters and sorting ({panelMarkers.length})
			</label>
			{#if canChooseSelected}
				<label class="label">
					<input
						type="radio"
						name="scope"
						class="radio radio-sm"
						checked={onlySelected}
						onchange={() => (onlySelected = true)}
					/>
					Only selected ({selected.length})
				</label>
			{/if}
		</fieldset>

		{#if progress.kind === "grabbing"}
			<div class="flex flex-col gap-1" role="status">
				<progress class="progress w-full" value={progress.done} max={progress.total}></progress>
				<span class="text-sm text-base-content/70">
					Grabbing frame {Math.min(progress.done + 1, progress.total)} of {progress.total}
				</span>
			</div>
		{:else if progress.kind === "building"}
			<div class="flex flex-col gap-1" role="status">
				<progress class="progress w-full"></progress>
				<span class="text-sm text-base-content/70">Creating the {FORMATS[format].label} file</span>
			</div>
		{:else if progress.kind === "error"}
			<p class="text-sm text-error" role="alert">{progress.message}</p>
		{/if}

		<div class="modal-action">
			<button type="button" class="btn" onclick={() => dialog?.close()}>Cancel</button>
			<button type="submit" class="btn btn-primary" disabled={busy || list.length === 0}>
				Export {list.length} marker{list.length === 1 ? "" : "s"}
			</button>
		</div>
	</form>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
