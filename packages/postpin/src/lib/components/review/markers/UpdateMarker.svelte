<script lang="ts">
	import EditCategoriesModal from "../../categories/EditCategoriesModal.svelte";
	import CategoryBadge from "../../categories/CategoryBadge.svelte";
	import CategorySelector from "../../categories/CategorySelector.svelte";

	import { updateMarker, deleteMarker, getCategories, getMarkers } from "./markers.remote";
	import { markersKey } from "./marker-scope.ts";
	import { page } from "$app/state";
	import { defaultCategory } from "./default-category.svelte.ts";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import Trash from "@lucide/svelte/icons/trash";
	import { onDestroy, onMount, type Snippet } from "svelte";
	import X from "@lucide/svelte/icons/x";
	import CircleArrowLeft from "@lucide/svelte/icons/circle-arrow-left";
	import type { ReviewMarker } from "./types";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import { timecodeFormat } from "../timecode-format.svelte.ts";
	import { lastFrameOf } from "@postpin-io/shared/logic/ranges";
	import MoveHorizontal from "@lucide/svelte/icons/move-horizontal";
	import Diamond from "@lucide/svelte/icons/diamond";
	import { useShare } from "../share-context.ts";
	import PointerSelector from "./PointerSelector.svelte";
	import { usePointerSession } from "./pointer-session.svelte.ts";
	import { useMarkerHistory } from "./marker-history.svelte.ts";
	import { signalGuide } from "../../guides/guide-signals.svelte.ts";

	let {
		marker,
		startFrame,
		frameRate,
		frameCount,
		onclose,
		mobile = false,
		mobileHeaderAction,
	}: Props = $props();
	let titleInputField: HTMLInputElement | null = null;
	let titleFocusToggled = $state(false);

	interface Props {
		onclose?: () => void;
		marker: ReviewMarker;
		startFrame: number;
		frameRate: FrameRate;
		/** Timeline length in frames */
		frameCount: number;
		/** Inside the phone's marker modal: no card, no close button (the modal has one) */
		mobile?: boolean;
		mobileHeaderAction?: Snippet;
	}
	const getShare = useShare();
	const share = $derived(getShare());

	// ─── Pointers: arrows and boxes on the picture ───
	const pointerSession = usePointerSession();
	const pointerScope = $derived({ exportId: marker.exportId, shareToken: share?.token });

	// ─── Header: the category shows its name while there's room ───
	// The controls wrap below the title as one group by CSS (see markup). Measured here: whether the
	// category has to shrink to its dot first. Every input is a natural width that doesn't depend on
	// the outcome, so it settles at once instead of jumping back and forth.
	let header = $state<HTMLElement>();
	let headerTitle = $state<HTMLElement>();
	let headerControls = $state<HTMLElement>();
	let headerActions = $state<HTMLElement>();
	let categorySlot = $state<HTMLElement>();
	let categoryWidths = $state({ expanded: 0, collapsed: 0 });
	let categoryCollapsed = $state(false);

	function layoutHeader() {
		if (!header || !headerControls || !headerActions || !categorySlot) return;
		const style = (el: HTMLElement, prop: "columnGap") =>
			parseFloat(getComputedStyle(el)[prop]) || 0;
		const gap = style(headerControls, "columnGap");
		const headerGap = style(header, "columnGap");
		// Popovers sit in the top layer and take no room
		const others = [...headerControls.children].filter(
			(el): el is HTMLElement =>
				el instanceof HTMLElement &&
				el !== categorySlot &&
				!el.hasAttribute("popover") &&
				el.offsetWidth > 0,
		);
		const othersWidth = others.reduce((sum, el) => sum + el.offsetWidth + gap, 0);
		// The title and controls share what the actions leave; the controls' own line has all of it
		const ownLine = header.clientWidth - headerActions.offsetWidth - headerGap;
		const firstLine = ownLine - (headerTitle ? headerTitle.offsetWidth + headerGap : 0);
		const fits = (width: number, category: number) => othersWidth + category <= width - 1; // subpixel rounding
		const { expanded, collapsed } = categoryWidths;
		categoryCollapsed = fits(firstLine, expanded)
			? false
			: fits(firstLine, collapsed) || !fits(ownLine, expanded);
	}

	$effect(() => {
		void categoryWidths;
		if (!header || !headerControls) return;
		const resize = new ResizeObserver(layoutHeader);
		const observeAll = () => {
			resize.disconnect();
			for (const el of [header, headerTitle, headerActions, ...headerControls!.children]) {
				if (el instanceof HTMLElement && el !== categorySlot && !el.hasAttribute("popover")) {
					resize.observe(el);
				}
			}
		};
		// Controls come and go (pointer count, permissions): watch the new ones too
		const children = new MutationObserver(observeAll);
		children.observe(headerControls, { childList: true });
		observeAll();
		return () => {
			resize.disconnect();
			children.disconnect();
		};
	});

	// Team only: the modal loads the project's categories as soon as it renders
	let editCategoriesModal = $state<EditCategoriesModal>();
	// The parent keys this component on the marker id, so the initial values are intentional

	let name = $state(marker.name);

	let description = $state(marker.description ?? "");

	let selectedCategoryId = $state<string>(marker.categoryId);
	let movedFrame: number | null = null;
	let changedDuration: number | null = null;
	let saving = $state(false);
	let fieldFocused = $state(false);

	let projectId = $derived(page.params.project ?? "");
	// Guests don't pick categories: their markers stay in the guest category
	let categories = $derived(share ? [] : await getCategories(projectId));
	let categoryId = $derived(selectedCategoryId ?? categories[0]?.id);

	// Last values sent to the server, so changes are detected independently of the refreshed prop
	let saved = {
		name: marker.name,
		description: marker.description ?? "",
		categoryId: marker.categoryId,
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	let queued = false;
	let removed = false;
	onMount(() => {
		titleFocusToggled = localStorage.getItem("UpdateMarkerFocused") === "true";
	});

	function schedule(delay = 400) {
		let timeLimit = 1000;
		clearTimeout(timer);
		if (delay > timeLimit) delay = timeLimit;
		timer = setTimeout(persist, delay);
	}

	async function persist() {
		clearTimeout(timer);
		if (!marker.canUpdate) return;
		if (removed) return;
		if (saving) {
			queued = true;
			return;
		}
		const next = {
			name: name.trim(),
			description: description.trim(),
			categoryId,
			frame: movedFrame ?? marker.frame,
		};
		if (!next.categoryId) return;
		if (
			next.name === saved.name &&
			next.description === saved.description &&
			next.categoryId === saved.categoryId &&
			movedFrame === null &&
			changedDuration === null
		) {
			return;
		}

		// Left out unless changed here: the server keeps the duration, e.g. one just dragged in the timeline
		const duration = changedDuration;
		saving = true;
		try {
			const category = categories.find((c) => c.id === next.categoryId);
			const save = updateMarker({
				id: marker.id,
				name: next.name,
				description: next.description,
				categoryId: next.categoryId,
				frame: next.frame,
				...(duration !== null ? { duration } : {}),
				shareToken: share?.token,
			}).updates(
				// Shows the edit everywhere right away (list, timeline, swipe cards), before the server answers
				getMarkers(markersKey(marker.exportId, share?.token)).withOverride((markers) =>
					markers.map((m) =>
						m.id !== marker.id
							? m
							: {
									...m,
									name: next.name,
									description: next.description,
									frame: next.frame,
									duration: duration ?? m.duration,
									categoryId: next.categoryId,
									category: category
										? { ...m.category, id: category.id, name: category.name, color: category.color }
										: m.category,
								},
					),
				),
			);
			await (markerHistory?.track(save) ?? save);

			saved = { name: next.name, description: next.description, categoryId: next.categoryId };
			if (movedFrame === next.frame) movedFrame = null;
			if (changedDuration === duration) changedDuration = null;
		} finally {
			saving = false;
		}
		if (queued) {
			queued = false;
			void persist();
		}
	}

	// A new range is one second long, or shorter when the timeline ends earlier
	function toggleRange() {
		const fps = Math.round(frameRate.fpsNumerator / frameRate.fpsDenominator);
		const frame = movedFrame ?? marker.frame;
		const timelineEnd = startFrame + Math.max(frameCount, 1);
		changedDuration = marker.duration > 0 ? 0 : Math.max(Math.min(fps, timelineEnd - frame), 1);
		void persist();
	}

	/** Moves the marker to another frame, saved together with the other fields */
	export function moveTo(newFrame: number) {
		// A range that would run past the end stops there, instead of the server refusing it
		const lastStart = startFrame + Math.max(frameCount, 1) - Math.max(marker.duration, 1);
		movedFrame = Math.min(newFrame, lastStart);
		void persist();
	}

	async function openEditCategoriesModal() {
		editCategoriesModal?.open(page.params.project ?? "");
	}
	export async function remove() {
		if (!marker.canDelete) return;
		removed = true;
		clearTimeout(timer);
		saving = true;
		try {
			const deletion = deleteMarker(share ? { id: marker.id, shareToken: share.token } : marker.id);
			await (markerHistory?.track(deletion) ?? deletion);
		} catch (error) {
			removed = false;
			throw error;
		} finally {
			saving = false;
		}
	}

	// Flush pending edits when the editor closes or switches to another marker
	onDestroy(() => {
		if (timer) void persist();
	});

	// ⌘Z sends pending edits first, so it takes back the newest change and not the one before
	const markerHistory = useMarkerHistory();
	onMount(() =>
		markerHistory?.onflush(() => {
			if (timer) void persist();
		}),
	);

	async function finish(event: KeyboardEvent) {
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		await persist();
		onclose?.();
	}

	/** Enter or leaving the title: saved now, and first-review knows the marker has one */
	function titleDone() {
		if (!name.trim()) return;
		void persist();
		signalGuide("first-review", "title");
	}

	export function focusTitleInputField() {
		titleInputField?.focus();
	}
	export function toggleFocusTitleInputField() {
		titleFocusToggled = !titleFocusToggled;
		localStorage.setItem("UpdateMarkerFocused", String(titleFocusToggled));
		titleInputField?.focus();
	}
</script>

<section
	class="@container {mobile ? '' : 'card mx-1 h-full border border-base-300 bg-base-200 shadow-sm'}"
>
	<div class="card-body h-full min-h-0 w-full gap-3 p-4">
		<!-- Title and controls wrap, the actions keep the top right corner. The controls break as one
		group: a flex item wraps at its full (max-content) width, so they move below the title together
		once they don't fit beside it, and only wrap among themselves when even their own line is too
		narrow. Before that, the category shrinks to its dot (see layoutHeader). -->
		<div bind:this={header} class="flex items-start gap-3">
			<div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
				{#if mobile}
					<!-- The card header already says "Edit Marker"; the selector shows the category unless it's a guest -->
					{#if share && marker.category}
						<CategoryBadge category={marker.category} class="badge-md" />
					{/if}
				{:else}
					<h2 bind:this={headerTitle} class="card-title text-base whitespace-nowrap">
						{#if marker.canUpdate}
							Edit Marker
						{:else}
							View Marker
						{/if}
					</h2>
				{/if}
				<div
					bind:this={headerControls}
					class="flex min-w-0 flex-wrap items-center gap-2 *:shrink-0"
				>
					{#if !share}
						<div
							bind:this={categorySlot}
							class="flex min-w-0"
							data-guide={marker.canUpdate && !mobile ? "first-review/category" : undefined}
						>
							<CategorySelector
								value={categoryId}
								onselect={(id) => {
									selectedCategoryId = id;
									defaultCategory.set(id);
									void persist();
									signalGuide("first-review", "category");
								}}
								readonly={!marker.canUpdate}
								collapsed={categoryCollapsed}
								bind:widths={categoryWidths}
							/>
						</div>

						{#if marker.canUpdate}
							<button
								type="button"
								class="btn btn-square"
								title="New category"
								aria-label="New category"
								onclick={openEditCategoriesModal}
							>
								<ClipboardList size={20} />
							</button>
						{/if}
					{/if}
					{#if marker.canUpdate}
						<button
							type="button"
							class="btn btn-square btn-ghost"
							title={marker.duration > 0 ? "Make it a point marker" : "Make it a range"}
							aria-label={marker.duration > 0 ? "Make it a point marker" : "Make it a range"}
							data-guide={marker.duration === 0 && !mobile ? "marker-ranges/make-range" : undefined}
							disabled={saving}
							onclick={toggleRange}
						>
							{#if marker.duration > 0}<Diamond size={20} />{:else}<MoveHorizontal size={20} />{/if}
						</button>
					{/if}
					{#if pointerSession && (marker.canUpdate || marker.pointers.length > 0)}
						<PointerSelector {marker} scope={pointerScope} />
					{/if}
				</div>
			</div>
			<div bind:this={headerActions} class="ml-auto flex shrink-0 gap-2">
				{#if mobile && mobileHeaderAction}
					{@render mobileHeaderAction()}
				{/if}
				{#if !mobile}
					<button
						type="button"
						class="btn btn-square btn-ghost"
						title="Close"
						aria-label="Close marker editor"
						onclick={() => onclose?.()}
					>
						<X />
					</button>
				{/if}

				{#if marker.canDelete && !mobile}
					<button
						type="button"
						class="btn btn-square btn-error"
						title="Delete marker"
						aria-label="Delete marker"
						disabled={saving}
						onclick={() => remove()}
					>
						<Trash size={20} />
					</button>
				{/if}
			</div>
		</div>
		<!-- On its own line: in the header it squeezes the category selector. A div, as daisyUI lets a
		card-body p grow -->
		{#if marker.duration > 0}
			<div class="-mt-1 font-mono text-xs text-base-content/60" title="In – Out (duration)">
				{timecodeFormat.position(marker.frame, frameRate, startFrame)} – {timecodeFormat.position(
					lastFrameOf(marker),
					frameRate,
					startFrame,
				)}
				({timecodeFormat.length(marker.duration, frameRate)})
			</div>
		{/if}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<form
			class="flex min-h-0 flex-1 flex-col gap-2"
			onkeydown={finish}
			onsubmit={(e) => e.preventDefault()}
		>
			<div class="flex items-center gap-2">
				<input
					bind:this={titleInputField}
					type="text"
					class="input w-full"
					placeholder="Title"
					aria-label="Marker title"
					data-guide={marker.canUpdate && !mobile ? "first-review/title" : undefined}
					bind:value={name}
					onfocus={() => (fieldFocused = true)}
					onblur={() => {
						fieldFocused = false;
						titleDone();
					}}
					onkeydown={(e) => {
						if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
						e.preventDefault();
						titleDone();
					}}
					oninput={() => schedule()}
					readonly={!marker.canUpdate}
				/>
				<!-- Typing right after creating a marker needs a keyboard -->
				<button
					type="button"
					class="btn btn-square btn-ghost pointer-coarse:hidden"
					tabindex="-1"
					class:btn-active={titleFocusToggled}
					class:text-accent={titleFocusToggled}
					title="When creating a new marker, you can immediately start typing the title"
					onclick={() => toggleFocusTitleInputField()}
				>
					<CircleArrowLeft />
				</button>
			</div>

			<textarea
				readonly={!marker.canUpdate}
				class="textarea w-full resize-none {mobile ? 'min-h-40' : 'min-h-0 flex-1'}"
				rows="2"
				placeholder="Description"
				aria-label="Marker description"
				bind:value={description}
				onfocus={() => (fieldFocused = true)}
				onblur={() => (fieldFocused = false)}
				oninput={() => schedule()}></textarea>
			<div class="flex shrink-0 items-center justify-between gap-2">
				<span class="flex items-center gap-2 text-xs text-base-content/60" aria-live="polite">
					{#if saving}<span class="loading loading-xs loading-spinner"></span>Saving…{/if}
				</span>
				{#if fieldFocused}
					<span class="text-xs text-base-content/60 pointer-coarse:hidden"
						>⌘/Ctrl + Enter to close</span
					>
				{/if}
			</div>
		</form>
	</div>
</section>
{#if !share}
	<EditCategoriesModal bind:this={editCategoriesModal} />
{/if}
