<script lang="ts">
	import EditCategoriesModal from "./EditCategoriesModal.svelte";

	import type { Prisma } from "@postpin-io/shared/db";
	import { updateMarker, deleteMarker, getCategories, createCategory } from "./MarkerPanel.remote";
	import { page } from "$app/state";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import { onDestroy, onMount } from "svelte";
	import X from "@lucide/svelte/icons/x";
	import CircleArrowLeft from "@lucide/svelte/icons/circle-arrow-left";

	let { marker, startFrame, onclose }: Props = $props();
	let titleInputField: HTMLInputElement | null = null;
	let titleFocusToggled = $state(false);
	interface Props {
		onclose?: () => void;
		marker: Prisma.MarkerGetPayload<{
			include: {
				author: true;
				category: true;
			};
		}>;
		startFrame: number;
	}

	let editCategoriesModal: EditCategoriesModal;
	// The parent keys this component on the marker id, so the initial values are intentional

	let name = $state(marker.name);

	let description = $state(marker.description ?? "");

	let selectedCategoryId = $state<string>(marker.categoryId);
	let saving = $state(false);

	let projectId = $derived(page.params.project ?? "");
	let categories = $derived(await getCategories(projectId));
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
				exportId: marker.exportId,
				name: next.name,
				description: next.description,
				categoryId: next.categoryId,
				frame: marker.frame,
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
		editCategoriesModal.open(page.params.project ?? "");
	}
	async function remove() {
		removed = true;
		clearTimeout(timer);
		saving = true;
		try {
			await deleteMarker(marker.id);
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

	export function focusTitleInputField() {
		titleInputField?.focus();
	}
	export function toggleFocusTitleInputField() {
		titleFocusToggled = !titleFocusToggled;
		localStorage.setItem("UpdateMarkerFocused", String(titleFocusToggled));
		titleInputField?.focus();
	}
</script>

<section class="card mx-1 h-full border border-base-300 bg-base-200 shadow-sm">
	<div class="card-body h-full gap-3 p-4">
		<div class="flex items-center justify-between gap-3">
			<h2 class="card-title text-base">Edit marker</h2>

			<select
				class="select min-w-0 flex-1"
				aria-label="Category"
				value={categoryId}
				onchange={(e) => {
					selectedCategoryId = e.currentTarget.value;
					localStorage.setItem("DefaultCategory", selectedCategoryId);
					void persist();
				}}
			>
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>

			<button
				type="button"
				class="btn btn-square btn-outline"
				title="New category"
				aria-label="New category"
				onclick={openEditCategoriesModal}
			>
				<ClipboardList />
			</button>

			<span class="badge badge-outline tabular-nums" title="Marker frame">
				Frame {marker.frame - startFrame}
			</span>

			<button
				type="button"
				class="btn btn-square btn-ghost"
				title="Close"
				aria-label="Close marker editor"
				onclick={() => onclose?.()}
			>
				<X />
			</button>
		</div>

		<form class="flex h-full flex-col gap-2" onsubmit={(e) => e.preventDefault()}>
			<div class="flex items-center gap-2">
				<input
					bind:this={titleInputField}
					type="text"
					class="input w-full"
					placeholder="Title"
					aria-label="Marker title"
					bind:value={name}
					oninput={() => schedule()}
				/>
				<button
					type="button"
					class="btn btn-square btn-ghost"
					class:btn-active={titleFocusToggled}
					class:text-accent={titleFocusToggled}
					title="When creating a new marker, you can immediately start typing the title"
					onclick={() => toggleFocusTitleInputField()}
				>
					<CircleArrowLeft />
				</button>
			</div>
			<textarea
				class="textarea h-full w-full resize-none"
				rows="2"
				placeholder="Description"
				aria-label="Marker description"
				bind:value={description}
				oninput={() => schedule()}></textarea>

			<div class="flex items-center justify-between gap-2">
				<span class="flex items-center gap-2 text-xs text-base-content/60" aria-live="polite">
					{#if saving}<span class="loading loading-xs loading-spinner"></span>Saving…{/if}
				</span>
				<button type="button" class="btn btn-outline btn-error" disabled={saving} onclick={remove}>
					Delete
				</button>
			</div>
		</form>
	</div>
</section>
<EditCategoriesModal bind:this={editCategoriesModal} />
