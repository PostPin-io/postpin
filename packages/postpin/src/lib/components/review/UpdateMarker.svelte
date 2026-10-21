<script lang="ts">
	import EditCategoriesModal from "./EditCategoriesModal.svelte";

	import type { Prisma } from "@postpin-io/shared/db";
	import { updateMarker, deleteMarker, getCategories, createCategory } from "./MarkerPanel.remote";
	import { page } from "$app/state";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	let { marker, startFrame }: Props = $props();

	interface Props {
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
	let dirty = $derived(
		name !== marker.name ||
			description !== (marker.description ?? "") ||
			categoryId !== marker.categoryId,
	);
	let canSave = $derived(dirty && !!categoryId && !saving);

	async function save(event: Event) {
		event.preventDefault();
		if (!canSave || !categoryId) return;
		saving = true;
		try {
			await updateMarker({
				id: marker.id,
				exportId: marker.exportId,
				name: name.trim(),
				description: description.trim(),
				categoryId,
				frame: marker.frame,
			});
		} finally {
			saving = false;
		}
	}

	async function openEditCategoriesModal() {
		editCategoriesModal.open(page.params.project ?? "");
	}
	async function remove() {
		saving = true;
		try {
			await deleteMarker(marker.id);
		} finally {
			saving = false;
		}
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
					save(e);
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
		</div>

		<form class="flex h-full flex-col gap-2" onsubmit={save}>
			<input
				type="text"
				class="input w-full"
				placeholder="Title"
				aria-label="Marker title"
				bind:value={name}
			/>
			<textarea
				class="textarea h-full w-full resize-none"
				rows="2"
				placeholder="Description"
				aria-label="Marker description"
				bind:value={description}></textarea>

			<div class="flex gap-2">
				<button type="submit" class="btn flex-1 btn-primary" disabled={!canSave}>
					{#if saving}<span class="loading loading-sm loading-spinner"></span>{/if}
					Save
				</button>
				<button type="button" class="btn btn-outline btn-error" disabled={saving} onclick={remove}>
					Delete
				</button>
			</div>
		</form>
	</div>
</section>
<EditCategoriesModal bind:this={editCategoriesModal} />
