<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { getExportList } from "./exportlist.remote.ts";
	import { getUrl } from "../../../../../videotests/videotests.remote.ts";
	import RenameExportModal from "#lib/components/RenameExportModal.svelte";

	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import Apeture from "@lucide/svelte/icons/aperture";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import FileDown from "@lucide/svelte/icons/file-down";
	import Link from "@lucide/svelte/icons/link";
	import Pencil from "@lucide/svelte/icons/pencil";

	let viewMode: "table" | "card" = $state("card");
	let sortField: "name" | "created" | "updated" = $state("updated");
	let sortDirection: "asc" | "desc" = $state("desc");
	let loadingStatus = $state(true);

	let renameExportDialog: RenameExportModal | null = null;

	let exports = $derived(await getExportList(page.params.timeline || ""));

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}

	function exportUrl(id: string) {
		return `/projects/${page.params.project}/timelines/${page.params.timeline}/exports/${id}`;
	}

	function closeMenu(id: string) {
		document.getElementById(`export-menu-${id}`)?.hidePopover();
	}

	async function copyLink(id: string) {
		closeMenu(id);
		try {
			await navigator.clipboard.writeText(location.origin + exportUrl(id));
		} catch (err) {
			console.error("Could not copy link", err);
		}
	}

	function renameExport(singleExport: (typeof exports)[number]) {
		closeMenu(singleExport.id);
		renameExportDialog?.open(singleExport);
	}

	onMount(() => {
		const storedMode = localStorage.getItem("ExportsView");
		const storedFieldStatus = localStorage.getItem("SortFieldStatus");
		const storedDirectionStatus = localStorage.getItem("SortDirectionStatus");

		viewMode = storedMode == "table" ? "table" : "card";
		sortDirection = storedDirectionStatus == "desc" ? "desc" : "asc";
		if (
			storedFieldStatus == "name" ||
			storedFieldStatus == "updated" ||
			storedFieldStatus == "created"
		) {
			sortField = storedFieldStatus;
		}
		loadingStatus = false;
	});

	$effect(() => {
		localStorage.setItem("ExportsView", viewMode);
	});
	$effect(() => {
		localStorage.setItem("SortFieldStatus", sortField);
	});
	$effect(() => {
		localStorage.setItem("SortDirectionStatus", sortDirection);
	});
</script>

<!--
	Ein Dropdown für alle Aktionen eines Exports (Öffnen, Link kopieren, Umbenennen).
	Nutzt das Popover-API von daisyUI 5: Das Menü liegt im Top-Layer des Browsers
	und wird deshalb nicht von overflow-Containern (Tabelle, Card) abgeschnitten.
-->
{#snippet actionsMenu(singleExport: (typeof exports)[number], exportHref: string)}
	<button
		type="button"
		class="btn badge shrink-0 badge-ghost"
		aria-label="Export actions"
		popovertarget="export-menu-{singleExport.id}"
		style="anchor-name: --export-anchor-{singleExport.id}"
	>
		<Ellipsis />
	</button>

	<ul
		id="export-menu-{singleExport.id}"
		popover
		class="menu dropdown dropdown-end z-50 w-56 rounded-box bg-base-100 p-2 text-left shadow-lg"
		style="position-anchor: --export-anchor-{singleExport.id}"
	>
		<li>
			<a href={exportHref}>
				<FileDown class="size-4" />
				Open export
			</a>
		</li>
		<li>
			<button type="button" onclick={() => copyLink(singleExport.id)}>
				<Link class="size-4" />
				Copy link
			</button>
		</li>
		<li class="mt-1 border-t border-base-300 pt-1">
			<button type="button" onclick={() => renameExport(singleExport)}>
				<Pencil class="size-4" />
				Rename export
			</button>
		</li>
	</ul>
{/snippet}

{#snippet chevronToggle(field: typeof sortField)}
	{#if sortField == field}
		{#if sortDirection == "asc"}
			<ChevronUp size={15} />
		{:else}
			<ChevronDown size={15} />
		{/if}
	{/if}
{/snippet}

<div class="flex h-full w-full flex-col gap-6 p-6">
	{#if loadingStatus}
		<div class="flex flex-1 items-center justify-center" role="status" aria-live="polite">
			<div
				class="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-base-300 bg-base-100 px-8 py-10 text-center shadow-lg"
			>
				<span class="loading loading-lg loading-spinner text-primary" aria-hidden="true"></span>
				<div>
					<p class="text-lg font-semibold">Loading your exports</p>
					<p class="mt-1 text-sm text-base-content/70">
						Please wait while we get everything ready.
					</p>
				</div>
			</div>
		</div>
	{:else}
		<header class="flex justify-between border-b border-base-300 pb-4">
			<h1 class="text-2xl font-bold">Your Exports</h1>

			<div class="flex flex-wrap items-baseline gap-3">
				<div class="flex flex-wrap items-center gap-2">
					{#if viewMode == "card"}
						<label class="text-sm font-medium" for="export-sort">Sort by</label>
						<select id="export-sort" class="select-bordered select w-56" bind:value={sortField}>
							<option value="name">Name</option>
							<option value="created">Created</option>
							<option value="updated">Updated</option>
						</select>

						<button
							type="button"
							aria-label="Toggle sort direction"
							onclick={() => {
								sortDirection = sortDirection == "asc" ? "desc" : "asc";
							}}
						>
							{#if sortDirection == "asc"}
								<ChevronUp />
							{:else}
								<ChevronDown />
							{/if}
						</button>
					{/if}
				</div>

				<div class="join" role="group">
					<button
						class="btn join-item btn-sm"
						class:btn-active={viewMode === "table"}
						aria-pressed={viewMode === "table"}
						onclick={() => (viewMode = "table")}>Table</button
					>
					<button
						class="btn join-item btn-sm"
						class:btn-active={viewMode === "card"}
						aria-pressed={viewMode === "card"}
						onclick={() => (viewMode = "card")}>Cards</button
					>
				</div>
			</div>
		</header>

		{@const sortedExports = [...exports].sort((a, b) => {
			const comparison =
				sortField === "name"
					? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
					: sortField === "created"
						? a.createdAt.getTime() - b.createdAt.getTime()
						: a.updatedAt.getTime() - b.updatedAt.getTime();

			return (sortDirection == "asc" ? 1 : -1) * comparison || a.id.localeCompare(b.id);
		})}

		{#if viewMode === "table"}
			<div class="overflow-x-auto rounded-box border border-base-content/10 bg-base-100 shadow">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th class="w-44"><span class="sr-only">Thumbnail</span></th>
							<th>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-1 select-none hover:text-base-content"
									onclick={() => sortBy("name")}
								>
									Name {@render chevronToggle("name")}
								</button>
							</th>
							<th>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-1 select-none hover:text-base-content"
									onclick={() => sortBy("created")}
								>
									Created {@render chevronToggle("created")}
								</button>
							</th>
							<th>
								<button
									type="button"
									class="flex cursor-pointer items-center gap-1 select-none hover:text-base-content"
									onclick={() => sortBy("updated")}
								>
									Updated {@render chevronToggle("updated")}
								</button>
							</th>
							<th><span class="sr-only">Actions</span></th>
						</tr>
					</thead>

					<tbody>
						{#each sortedExports as singleExport (singleExport.id)}
							{@const exportHref = exportUrl(singleExport.id)}

							<tr class="hover:bg-base-200/60 [&>td]:align-middle">
								<td class="w-44">
									<div class="aspect-video w-36 overflow-hidden rounded-md bg-base-300">
										{#if singleExport.media}
											<a
												href={exportHref}
												class="group relative block size-full"
												aria-label="Open {singleExport.name}"
											>
												<img
													src={await getUrl({ mediaId: singleExport.media.id, type: "thumbnail" })}
													alt="Thumbnail of {singleExport.name}"
													loading="lazy"
													class="size-full object-cover transition duration-300 group-hover:scale-105"
												/>
											</a>
										{:else}
											<div class="flex size-full items-center justify-center text-base-content/30">
												<Apeture />
											</div>
										{/if}
									</div>
								</td>

								<td class="font-medium">{singleExport.name}</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(singleExport.createdAt).toLocaleDateString()}
								</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(singleExport.updatedAt).toLocaleDateString()}
								</td>

								<td class="text-right whitespace-nowrap">
									<div class="flex items-center justify-end gap-2">
										<a href={exportHref} class="btn btn-primary btn-sm">Open export</a>
										{@render actionsMenu(singleExport, exportHref)}
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="py-8 text-center text-base-content/70">No exports yet.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{#each sortedExports as singleExport (singleExport.id)}
					{@const exportHref = exportUrl(singleExport.id)}

					<article class="card h-full bg-base-100 shadow-xl">
						<figure class="group relative aspect-video overflow-hidden bg-base-300">
							{#if singleExport.media}
								<a href={exportHref} class="block size-full" aria-label="Open {singleExport.name}">
									<img
										src={await getUrl({ mediaId: singleExport.media.id, type: "thumbnail" })}
										alt="Thumbnail of {singleExport.name}"
										loading="lazy"
										class="size-full object-cover transition duration-300 group-hover:scale-105"
									/>
								</a>
							{:else}
								<div class="flex size-full items-center justify-center text-base-content/30">
									<Apeture />
								</div>
							{/if}
						</figure>

						<div class="card-body">
							<h2 class="card-title flex items-center justify-between gap-2">
								<span class="min-w-0 flex-1 truncate" title={singleExport.name}>
									{singleExport.name}
								</span>
								{@render actionsMenu(singleExport, exportHref)}
							</h2>
							<dl class="space-y-1 text-sm text-base-content/70">
								<div class="flex justify-between gap-4">
									<dt>Created</dt>
									<dd>{new Date(singleExport.createdAt).toLocaleDateString()}</dd>
								</div>
								<div class="flex justify-between gap-4">
									<dt>Last updated</dt>
									<dd>{new Date(singleExport.updatedAt).toLocaleDateString()}</dd>
								</div>
							</dl>

							<div class="mt-2 card-actions items-center justify-end">
								<a href={exportHref} class="btn btn-primary btn-sm">Open export</a>
							</div>
						</div>
					</article>
				{:else}
					<p class="text-base-content/70">No exports yet.</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<RenameExportModal bind:this={renameExportDialog} />
