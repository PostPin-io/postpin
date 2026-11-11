<script lang="ts">
	import EditCategoriesModal from "../../categories/EditCategoriesModal.svelte";
	import CategorySelector from "../../categories/CategorySelector.svelte";

	import { updateMarker, deleteMarker, getCategories } from "./markers.remote";
	import { page } from "$app/state";
	import { defaultCategory } from "./default-category.svelte.ts";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import Trash from "@lucide/svelte/icons/trash";
	import { onDestroy, onMount } from "svelte";
	import X from "@lucide/svelte/icons/x";
	import CircleArrowLeft from "@lucide/svelte/icons/circle-arrow-left";
	import type { ReviewMarker } from "./types";
	import { useShare } from "../share-context.ts";

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { marker, startFrame, onclose, mobile = false }: Props = $props();
	let titleInputField: HTMLInputElement | null = null;
	let titleFocusToggled = $state(false);

	interface Props {
		onclose?: () => void;
		marker: ReviewMarker;
		startFrame: number;
		/** Inside the phone's marker modal: no card, no close button (the modal has one) */
		mobile?: boolean;
	}
	const getShare = useShare();
	const share = $derived(getShare());

	// Team only: the modal loads the project's categories as soon as it renders
	let editCategoriesModal = $state<EditCategoriesModal>();
	// The parent keys this component on the marker id, so the initial values are intentional

	let name = $state(marker.name);

	let description = $state(marker.description ?? "");

	let selectedCategoryId = $state<string>(marker.categoryId);
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
		const next = { name: name.trim(), description: description.trim(), categoryId };
		if (!next.categoryId) return;
		if (
			next.name === saved.name &&
			next.description === saved.description &&
			next.categoryId === saved.categoryId
		) {
			return;
		}

		saving = true;
		try {
			await updateMarker({
				id: marker.id,
				name: next.name,
				description: next.description,
				categoryId: next.categoryId,
				frame: marker.frame,
				shareToken: share?.token,
			});

			saved = { ...next, categoryId: next.categoryId };
		} finally {
			saving = false;
		}
		if (queued) {
			queued = false;
			void persist();
		}
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
			await deleteMarker(share ? { id: marker.id, shareToken: share.token } : marker.id);
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

	async function finish(event: KeyboardEvent) {
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		await persist();
		onclose?.();
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
		<div class="flex items-center justify-between gap-3">
			<div class="flex-screen flex min-w-0 items-center gap-2">
				<h2 class="card-title text-base whitespace-nowrap">
					{#if marker.canUpdate}
						Edit Marker
					{:else}
						View Marker
					{/if}
				</h2>
				{#if !share}
					<CategorySelector
						value={categoryId}
						onselect={(id) => {
							selectedCategoryId = id;
							defaultCategory.set(id);
							void persist();
						}}
						readonly={!marker.canUpdate}
					/>

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
				<!-- <span class="badge badge-outline tabular-nums" title="Marker frame">
					Frame {marker.frame - startFrame}
					</span> -->
			</div>
			<div class="flex shrink-0 gap-2">
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
				{#if marker.canDelete}
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
					bind:value={name}
					onfocus={() => (fieldFocused = true)}
					onblur={() => (fieldFocused = false)}
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
