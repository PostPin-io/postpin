<script lang="ts">
	import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
	import { getShots, getTopClipShots, type GridShot } from "@postpin-io/shared/logic/shots";
	import { formatTimecode } from "@postpin-io/shared/logic/timecode";
	import { isWebUpload } from "@postpin-io/shared/logic/web-upload";
	import { shotGridMode } from "./shot-grid-mode.svelte.ts";
	import type { MovieBarcode } from "@postpin-io/shared/types/MovieBarcode";
	import { tick } from "svelte";
	import BarcodeOverview from "./BarcodeOverview.svelte";

	interface Props {
		snapshot: TimelineSnapshot;
		/** One per shot, by shot index; null or undefined while it is being made or loaded */
		thumbnailUrls: (string | null)[] | undefined;
		/** The same for the large images; undefined if the render has none */
		largeThumbnailUrls?: (string | null)[] | undefined;
		/** Pixel widths of both images, so the browser can pick the one a tile needs */
		thumbnailWidth?: number;
		largeThumbnailWidth?: number;
		currentFrame: number;
		/** Background of the overview below the grid */
		barcode?: MovieBarcode | null;
		onSeek(frame: number): void;
	}

	let {
		snapshot,
		thumbnailUrls,
		largeThumbnailUrls,
		thumbnailWidth = 320,
		largeThumbnailWidth = 1280,
		currentFrame,
		barcode,
		onSeek,
	}: Props = $props();

	// Cuts detected in a web upload are one track without anything on top: only the cuts mode.
	// Timeline data imported with it can have tracks on top of each other, so the choice is back.
	const detectedCuts = $derived(isWebUpload(snapshot) && !snapshot.metadata.cutsFrom);
	const mode = $derived(detectedCuts ? "cuts" : shotGridMode.mode);

	// the thumbnails are rendered for the shots at every cut; the other mode shows some of them
	const shots: GridShot[] = $derived(
		mode === "top"
			? getTopClipShots(snapshot)
			: getShots(snapshot).map((s) => ({ ...s, thumbnailIndex: s.index })),
	);
	// Search by shot name. Everything below works on the shots shown, the overview's rows too.
	let search = $state("");
	const visibleShots = $derived.by(() => {
		const needle = search.trim().toLocaleLowerCase();
		return needle ? shots.filter((s) => s.name.toLocaleLowerCase().includes(needle)) : shots;
	});
	// the query 404s until the job is done, so only ask once the polled export says it is

	let cols = $state(5);
	// tiles at least 100px wide, so the timecode fits: counted from the grid's own width, the
	// window's is wider than the panel
	let gridWidth = $state(0);
	const maxCols = $derived(Math.max(1, Math.floor(gridWidth / 100)));
	const columns = $derived(Math.max(1, maxCols - Math.min(cols, maxCols) + 1));
	// A tile never gets taller than the grid's view, so a whole shot is always in sight: its
	// 16:9 image plus what's below it (tile padding 8, two gaps 8, name and timecode 2 × 16)
	// and the scroller's padding (16). With few columns the tiles stop growing and center.
	const TILE_EXTRA_HEIGHT = 48;
	let scrollerHeight = $state(0);
	const maxTileWidth = $derived(
		Math.max(((scrollerHeight - 16 - TILE_EXTRA_HEIGHT) * 16) / 9 + 8, 100),
	);
	// The image's width in CSS pixels: grid minus its padding and gaps, minus the tile's padding.
	// With srcset the browser loads the large image only for tiles (and screens) that need it.
	const imageWidth = $derived(
		Math.max(
			Math.floor(Math.min((gridWidth - 16 - (columns - 1) * 8) / columns, maxTileWidth) - 8),
			1,
		),
	);

	// Overview: which part of the export the scrolled grid shows. Each row of tiles stands for the
	// frames from its first shot to the next row's, so scroll position and frames map both ways.
	let scroller = $state<HTMLDivElement>();
	let grid = $state<HTMLDivElement>();
	let view = $state({ start: 0, width: 1 });

	const toFraction = (frame: number) =>
		snapshot.durationFrameCount > 0
			? (frame - snapshot.startFrameIndex) / snapshot.durationFrameCount
			: 0;
	const toFrame = (fraction: number) =>
		snapshot.startFrameIndex + fraction * snapshot.durationFrameCount;

	type Row = { top: number; frame: number };

	/** Row tops (in the scroller's content) with their first frame, closed by the export's end */
	function measureRows(): Row[] {
		const tiles = [...(grid?.children ?? [])] as HTMLElement[];
		const rows: Row[] = [];
		tiles.forEach((tile, index) => {
			if (rows.at(-1)?.top === tile.offsetTop) return;
			rows.push({ top: tile.offsetTop, frame: visibleShots[index]!.startFrameIndex });
		});
		const last = tiles.at(-1);
		if (last) {
			rows.push({
				top: last.offsetTop + last.offsetHeight,
				frame: snapshot.startFrameIndex + snapshot.durationFrameCount,
			});
		}
		return rows;
	}

	function frameAtY(rows: Row[], y: number) {
		const next = rows.findIndex((row) => row.top > y);
		if (next <= 0) return next === 0 ? rows[0]!.frame : rows.at(-1)!.frame;
		const a = rows[next - 1]!;
		const b = rows[next]!;
		return a.frame + ((y - a.top) / (b.top - a.top)) * (b.frame - a.frame);
	}

	function yAtFrame(rows: Row[], frame: number) {
		const next = rows.findIndex((row) => row.frame > frame);
		if (next <= 0) return next === 0 ? rows[0]!.top : rows.at(-1)!.top;
		const a = rows[next - 1]!;
		const b = rows[next]!;
		return a.top + ((frame - a.frame) / (b.frame - a.frame)) * (b.top - a.top);
	}

	function measureView() {
		const rows = measureRows();
		if (!scroller || rows.length < 2) {
			view = { start: 0, width: 1 };
			return;
		}
		const start = toFraction(frameAtY(rows, scroller.scrollTop));
		const end = toFraction(frameAtY(rows, scroller.scrollTop + scroller.clientHeight));
		view = { start, width: Math.max(end - start, 0) };
	}

	function pan(start: number) {
		const rows = measureRows();
		if (!scroller || rows.length < 2) return;
		// minus the scroller's top padding (p-2), so the first row can reach the top
		scroller.scrollTop = yAtFrame(rows, toFrame(start)) - 8;
	}

	// The grid has no zoom of its own: resizing the window picks the column count that shows
	// about that much. Estimated from the current tiles, the next layout is measured after.
	const GAP = 8; // gap-2, also the scroller's padding on each side (p-2) and the tile's (p-1) twice
	async function resize(edge: "start" | "end", start: number, width: number) {
		const tiles = [...(grid?.children ?? [])] as HTMLElement[];
		const tile = tiles[0];
		if (!tile || !scroller || visibleShots.length === 0) return;
		const rows = measureRows();
		const pitch = rows.length > 2 ? rows[1]!.top - rows[0]!.top : tile.offsetHeight + GAP;
		// What a tile has besides its 16:9 image: name, timecode, paddings, gap
		const extra = pitch - ((tile.offsetWidth - GAP) * 9) / 16;
		const usable = gridWidth - 2 * GAP;
		const shownShare = (count: number) => {
			const tileWidth = Math.min((usable - (count - 1) * GAP) / count, maxTileWidth);
			const rowPitch = ((tileWidth - GAP) * 9) / 16 + extra;
			return Math.min((count * scrollerHeight) / rowPitch / visibleShots.length, 1);
		};
		let best = columns;
		for (let count = 1; count <= maxCols; count++) {
			if (Math.abs(shownShare(count) - width) < Math.abs(shownShare(best) - width)) best = count;
		}
		// Only a new column count changes anything: no scrolling on every pointer move
		if (best === columns) return;
		cols = maxCols - best + 1;
		await tick();
		measureView();
		// The edge that wasn't dragged stays put
		pan(edge === "end" ? start : Math.max(start + width - view.width, 0));
	}

	// Layout changes move the rows: measure again once they are laid out
	$effect(() => {
		void [visibleShots, columns, gridWidth, scrollerHeight];
		tick().then(measureView);
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="flex items-center justify-end gap-2 border-b border-base-300 bg-base-100 p-2">
		{#if !detectedCuts}
			<div class="join" role="group" aria-label="Shots">
				<button
					type="button"
					class="btn join-item btn-xs {shotGridMode.mode === 'cuts' ? 'btn-active' : ''}"
					aria-pressed={shotGridMode.mode === "cuts"}
					title="A shot at every cut on any video track"
					onclick={() => shotGridMode.set("cuts")}>Every cut</button
				>
				<button
					type="button"
					class="btn join-item btn-xs {shotGridMode.mode === 'top' ? 'btn-active' : ''}"
					aria-pressed={shotGridMode.mode === "top"}
					title="A shot per clip on the topmost video track that has one"
					onclick={() => shotGridMode.set("top")}>Top clip</button
				>
			</div>
		{/if}
		<input
			type="search"
			class="input mr-auto w-48 input-xs"
			placeholder="Search shots"
			aria-label="Search shots by name"
			bind:value={search}
			onkeydown={(event) => {
				if (event.key === "Escape" && search) {
					event.stopPropagation();
					search = "";
				}
			}}
		/>
		<input type="range" bind:value={cols} min="1" max={maxCols} class="range w-32 range-primary" />
	</div>

	<!-- relative: the tiles' offsetTop counts from here -->
	<div
		bind:this={scroller}
		class="relative min-h-0 flex-1 overflow-auto p-2"
		bind:clientWidth={gridWidth}
		bind:clientHeight={scrollerHeight}
		onscroll={measureView}
	>
		{#if visibleShots.length > 0}
			<div
				bind:this={grid}
				class="grid justify-center gap-2"
				style="grid-template-columns: repeat({columns}, minmax(0, {maxTileWidth}px))"
			>
				{#each visibleShots as shot (shot.index)}
					{@const isCurrentShot =
						currentFrame >= shot.startFrameIndex &&
						currentFrame < shot.startFrameIndex + shot.durationFrameCount}
					{@const url = thumbnailUrls?.[shot.thumbnailIndex]}
					{@const largeUrl = largeThumbnailUrls?.[shot.thumbnailIndex]}

					<button
						type="button"
						class="flex min-w-0 cursor-pointer flex-col gap-1 rounded p-1 text-left hover:bg-base-300 {isCurrentShot
							? 'ring-2 ring-primary'
							: ''}"
						title={shot.name}
						onclick={() => onSeek(shot.startFrameIndex)}
					>
						{#if url}
							<img
								src={url}
								srcset={largeUrl
									? `${url} ${thumbnailWidth}w, ${largeUrl} ${largeThumbnailWidth}w`
									: undefined}
								sizes={largeUrl ? `${imageWidth}px` : undefined}
								alt={shot.name}
								loading="lazy"
								class="aspect-video w-full rounded bg-black object-contain"
							/>
						{:else}
							<div class="aspect-video w-full animate-pulse rounded bg-base-300"></div>
						{/if}
						<span class="truncate text-xs">{shot.name}</span>
						<span class="truncate font-mono text-xs text-base-content/60">
							{formatTimecode(shot.startFrameIndex, snapshot.frameRate)}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-base-content/60">
				{shots.length > 0 ? `No shot matches “${search.trim()}”.` : "No shots available."}
			</p>
		{/if}
	</div>
	{#if shots.length > 0}
		<div class="border-t border-base-300 bg-base-100 px-2">
			<BarcodeOverview
				{barcode}
				start={view.start}
				width={view.width}
				position={toFraction(currentFrame)}
				onpan={pan}
				onresize={resize}
				highlights={search.trim()
					? visibleShots.map((shot) => ({
							start: toFraction(shot.startFrameIndex),
							width: shot.durationFrameCount / snapshot.durationFrameCount,
						}))
					: null}
				onscroll={(delta) => pan(Math.min(Math.max(view.start + delta, 0), 1 - view.width))}
			/>
		</div>
	{/if}
</div>
