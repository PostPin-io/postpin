<script lang="ts" module>
	export type ImportMode = "tracks" | "markers";
	/** What an import did, for the window to show instead of the drop zone */
	export type ImportResult = { title: string; detail: string };
</script>

<script lang="ts">
	// Importing timeline data (EDL, FCPXML) into an export. What it brings decides what happens: a
	// file with video clips replaces a web upload's timeline (its markers come along), a file with
	// only markers (e.g. Resolve's "Timeline Markers" EDL) adds them, to any export. The file is
	// read here (see #lib/upload/cut-list-file.ts), checked against the timeline's frame rate, and
	// only its tracks and markers are sent.
	import FileUp from "@lucide/svelte/icons/file-up";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import {
		CUT_LIST_ACCEPT,
		checkCutListAt,
		cutListSummaryText,
		readCutListFile,
		readDroppedCutList,
		type CutListRead,
	} from "#lib/upload/cut-list-file.ts";
	import { importCutList } from "./cuts.remote.ts";

	interface Props {
		exportId: string;
		/** The timeline's, to check the file against before it is sent */
		frameRate: FrameRate;
		/**
		 * What may be imported: a new timeline (web uploads), markers. Without "tracks", only the
		 * markers of a file with clips are taken.
		 */
		modes: ImportMode[];
		/** The timeline came from timeline data already, so a new one replaces it */
		replaces?: boolean;
		/** Called after the import; the export's tracks or markers changed */
		onchanged?: () => void | Promise<void>;
		/** Called with what the import did; the window shows that and nothing else */
		onimported: (result: ImportResult) => void;
	}
	let { exportId, frameRate, modes, replaces = false, onchanged, onimported }: Props = $props();

	let importInput: HTMLInputElement | null = $state(null);
	let importing = $state(false);
	let dragging = $state(false);
	let failure = $state<string | null>(null);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

	/**
	 * Imports what was dropped elsewhere, e.g. on the window's icon. The read has to start in the
	 * drop event itself: the browser empties the dropped data right after it.
	 */
	export async function importFrom(read: Promise<CutListRead | null>) {
		await runImport(await read);
	}

	async function runImport(read: CutListRead | null) {
		if (!read || importing) return;
		const fail = (text: string) => (failure = text);
		if (!read.ok) return fail(read.error);
		// the video's rate is known: check here, so the answer comes at once
		const check = checkCutListAt(read.list, frameRate);
		if (!check.ok) return fail(check.error);
		// clips: a new timeline, where that may be; otherwise only the markers count
		const mode: ImportMode =
			check.videoClips > 0 && modes.includes("tracks") ? "tracks" : "markers";
		if (mode === "markers" && check.markers === 0) {
			return fail(
				check.videoClips > 0
					? `${read.name} has no markers; the clips of this timeline can't be replaced`
					: `${read.name} has no clips and no markers`,
			);
		}

		importing = true;
		failure = null;
		try {
			const res = await importCutList({
				exportId,
				cutList: read.list,
				replaceTracks: mode === "tracks",
			});
			const skipped = check.markers - res.markers;
			const markers =
				skipped > 0
					? `${plural(res.markers, "new marker")}, ${skipped} already there`
					: plural(res.markers, "marker");
			await onchanged?.();
			onimported(
				mode === "tracks"
					? {
							title: replaces ? "Timeline replaced" : "Timeline imported",
							detail: cutListSummaryText({ ...check, markers: res.markers }),
						}
					: { title: "Markers imported", detail: markers },
			);
		} catch (e) {
			fail((e as { body?: { message?: string } })?.body?.message ?? "The import failed");
		} finally {
			importing = false;
		}
	}
</script>

<!-- Not on phones: timeline data comes from an editing software on a computer -->
<div class="flex flex-col gap-2 max-sm:hidden">
	<!-- Like the upload form: dashed and faded, solid while dragging -->
	<button
		type="button"
		class="flex w-full flex-col items-center justify-center gap-1.5 rounded-box border-2 px-3 py-5 text-center text-xs transition-colors hover:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
			{dragging
			? 'border-base-content/50 bg-base-200/50'
			: 'border-dashed border-base-content/30 text-base-content/50'}"
		disabled={importing}
		onclick={() => importInput?.click()}
		ondragenter={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragover={(e) => e.preventDefault()}
		ondragleave={() => (dragging = false)}
		ondrop={async (e) => {
			e.preventDefault();
			dragging = false;
			await runImport(await readDroppedCutList(e.dataTransfer));
		}}
	>
		{#if importing}
			<span class="loading loading-md loading-spinner"></span>
			<span class="font-medium">Importing…</span>
		{:else}
			<FileUp size={22} />
			<span class="font-medium">Drop an EDL or FCPXML here or click to choose one</span>
		{/if}
	</button>
	{#if failure}
		<p class="text-xs text-error" role="alert">{failure}</p>
	{/if}
	<input
		bind:this={importInput}
		type="file"
		class="hidden"
		accept={CUT_LIST_ACCEPT}
		onchange={async (e) => {
			const file = e.currentTarget.files?.[0];
			e.currentTarget.value = "";
			if (file) await runImport(await readCutListFile(file));
		}}
	/>
</div>
