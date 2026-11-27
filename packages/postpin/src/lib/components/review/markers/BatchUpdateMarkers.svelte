<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import Trash from "@lucide/svelte/icons/trash";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import ChevronsLeft from "@lucide/svelte/icons/chevrons-left";
	import ChevronsRight from "@lucide/svelte/icons/chevrons-right";
	import CategorySelector from "../../categories/CategorySelector.svelte";
	import EditCategoriesModal from "../../categories/EditCategoriesModal.svelte";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import { parseTimecode } from "@postpin-io/shared/logic/timecode";
	import { lastFrameOf } from "@postpin-io/shared/logic/ranges";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import { commandKeyLabel } from "#lib/keyboard.ts";
	import { updateMarkers } from "./markers.remote.ts";
	import { useMarkerHistory } from "./marker-history.svelte.ts";
	import type { ReviewMarker } from "./types";

	interface Props {
		/** The selected markers, two or more */
		markers: ReviewMarker[];
		/** How many of them the list's filters hide */
		hiddenCount: number;
		projectId: string;
		startFrame: number;
		frameRate: FrameRate;
		/** Timeline length in frames */
		frameCount: number;
		ondelete: () => void;
		onclose: () => void;
	}
	let {
		markers,
		hiddenCount,
		projectId,
		startFrame,
		frameRate,
		frameCount,
		ondelete,
		onclose,
	}: Props = $props();

	const markerHistory = useMarkerHistory();

	// Only the markers the user may change; the others are left as they are, and said so
	let editable = $derived(markers.filter((m) => m.canUpdate));
	let lockedCount = $derived(markers.length - editable.length);
	let deletable = $derived(markers.every((m) => m.canDelete));

	// One value for all of them, or none: they differ ("Mixed")
	const common = <T,>(values: T[]) =>
		values.every((v) => v === values[0]) ? values[0] : undefined;
	let categoryId = $derived(common(editable.map((m) => m.categoryId)));
	// Each category once, in the order of the markers
	let mixedCategories = $derived(
		categoryId === undefined
			? [...new Map(editable.map((m) => [m.category.id, m.category])).values()]
			: [],
	);

	const fps = $derived(Math.round(frameRate.fpsNumerator / frameRate.fpsDenominator));
	const firstFrame = $derived(startFrame);
	const lastFrame = $derived(startFrame + Math.max(frameCount, 1) - 1);

	// How far they can move as a group before one leaves the timeline
	let room = $derived({
		back: Math.min(...editable.map((m) => m.frame)) - firstFrame,
		forward: lastFrame - Math.max(...editable.map((m) => lastFrameOf(m))),
	});
	const canShift = (frames: number) =>
		editable.length > 0 && (frames < 0 ? -frames <= room.back : frames <= room.forward);

	let saving = $state(false);
	let failure = $state<string | null>(null);

	async function apply(change: { categoryId?: string; shift?: number }) {
		if (editable.length === 0 || saving) return;
		saving = true;
		failure = null;
		try {
			const save = updateMarkers({
				exportId: editable[0]!.exportId,
				ids: editable.map((m) => m.id),
				...change,
			});
			await (markerHistory?.track(save) ?? save);
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	function shift(frames: number) {
		if (canShift(frames)) void apply({ shift: frames });
	}

	// "+1:00", "-00:00:02:00" or "-12": a timecode or a number of frames, back when negative
	let offsetInput = $state("");
	let offset = $derived.by(() => {
		const value = offsetInput.trim();
		if (!value) return null;
		const sign = value.startsWith("-") ? -1 : 1;
		const rest = value.replace(/^[+-]/, "").trim();
		try {
			return sign * (/^\d+$/.test(rest) ? Number(rest) : parseTimecode(rest, frameRate));
		} catch {
			return Number.NaN;
		}
	});
	let offsetValid = $derived(offset !== null && Number.isInteger(offset) && offset !== 0);

	function applyOffset(event: SubmitEvent) {
		event.preventDefault();
		if (!offsetValid || !canShift(offset!)) return;
		shift(offset!);
		offsetInput = "";
	}

	const cmd = commandKeyLabel();
	const uid = $props.id();
	let editCategoriesModal = $state<EditCategoriesModal>();
</script>

{#snippet step(frames: number, label: string, Icon: typeof ChevronLeft)}
	<button
		type="button"
		class="btn join-item btn-sm"
		title={label}
		aria-label="Move {label.toLowerCase()}"
		disabled={!canShift(frames)}
		onclick={() => shift(frames)}
	>
		<Icon size={16} />
	</button>
{/snippet}

<section class="card mx-1 h-full border border-base-300 bg-base-200 shadow-sm">
	<div class="card-body h-full min-h-0 w-full gap-4 p-4">
		<div class="flex items-start gap-3">
			<div class="min-w-0 flex-1">
				<h2 class="card-title text-base">{markers.length} markers selected</h2>
				{#if hiddenCount > 0}
					<p class="text-xs opacity-70">{hiddenCount} of them hidden by the filters</p>
				{/if}
				{#if lockedCount > 0}
					<p class="text-xs text-warning">
						{lockedCount} of {markers.length} can't be changed by you and stay as they are
					</p>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1">
				{#if deletable}
					<button
						type="button"
						class="btn btn-square btn-error"
						title="Delete {markers.length} markers ({cmd}⌫)"
						aria-label="Delete {markers.length} markers"
						onclick={ondelete}
					>
						<Trash size={20} />
					</button>
				{/if}
				<button
					type="button"
					class="btn btn-square btn-ghost"
					title="Deselect (Esc)"
					aria-label="Deselect the markers"
					onclick={onclose}
				>
					<X size={20} />
				</button>
			</div>
		</div>

		{#if editable.length > 0}
			<!-- Label and control side by side, like the fields of the single marker editor -->
			<fieldset
				class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm"
				disabled={saving}
			>
				<span class="opacity-70">Category</span>
				<div class="flex min-w-0 items-center gap-2">
					{#key projectId}
						<CategorySelector
							value={categoryId}
							mixed={mixedCategories}
							onselect={(id) => {
								if (id !== categoryId) void apply({ categoryId: id });
							}}
						/>
					{/key}
					<button
						type="button"
						class="btn btn-square"
						title="New category"
						aria-label="New category"
						onclick={() => editCategoriesModal?.open(projectId)}
					>
						<ClipboardList size={20} />
					</button>
				</div>

				<label class="opacity-70" for="batch-offset-{uid}">Move</label>
				<!-- Enter in the field moves by what's typed, the arrows by a frame or a second -->
				<form class="join w-full max-w-xs" onsubmit={applyOffset}>
					{@render step(-fps, "One second back", ChevronsLeft)}
					{@render step(-1, "One frame back", ChevronLeft)}
					<input
						id="batch-offset-{uid}"
						class="input join-item min-w-0 flex-1 text-center font-mono input-sm {offsetInput &&
						!offsetValid
							? 'input-error'
							: ''}"
						placeholder="±frames or ±TC"
						title="Move by frames (-12) or a timecode (+00:00:01:00), then Enter"
						autocomplete="off"
						bind:value={offsetInput}
					/>
					{@render step(1, "One frame forward", ChevronRight)}
					{@render step(fps, "One second forward", ChevronsRight)}
				</form>
				{#if offsetValid && !canShift(offset!)}
					<p class="col-start-2 text-xs text-warning">
						That would move a marker out of the timeline.
					</p>
				{/if}
			</fieldset>
		{/if}

		{#if failure}
			<p class="text-sm text-error">{failure}</p>
		{/if}
	</div>
</section>

<EditCategoriesModal bind:this={editCategoriesModal} />
