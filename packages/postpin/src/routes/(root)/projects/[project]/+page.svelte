<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { getTimelines } from "./timeline.remote.ts";
	import { getUrl } from "../../videotests/videotests.remote.ts";
	import NewTimelineModal from "#lib/components/NewTimelineModal.svelte";
	import RenameTimelineModal from "#lib/components/RenameTimelineModal.svelte";
	import DeleteTimelineModal from "#lib/components/DeleteTimelineModal.svelte";

	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import FileDown from "@lucide/svelte/icons/file-down";
	import List from "@lucide/svelte/icons/list";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Trash from "@lucide/svelte/icons/trash";
	import Plus from "@lucide/svelte/icons/plus";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import Apeture from "@lucide/svelte/icons/aperture";

	let viewMode: "table" | "card" = $state("card");
	let sortField: "name" | "created" | "updated" = $state("updated");
	let sortDirection: "asc" | "desc" = $state("desc");
	let loadingStatus = $state(true);

	let delTimelineDialog: DeleteTimelineModal | null = null;
	let renameTimelineDialog: RenameTimelineModal | null = null;
	let timelineDialog: NewTimelineModal | null = null;

	let timelines = $derived(await getTimelines(page.params.project || ""));

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}

	function exportLinks(timeline: (typeof timelines)[number]) {
		const latest = timeline.exports[0];
		const base = `/projects/${page.params.project}/timelines/${timeline.id}/exports`;
		return {
			latest,
			exportHref: latest ? `${base}/${latest.id}` : null,
			exportListHref: latest ? `${base}/exportlist` : null,
		};
	}

	function closeMenu(timeline: (typeof timelines)[number]) {
		document.getElementById(`timeline-menu-${timeline.id}`)?.hidePopover();
	}

	function renameTimeline(timeline: (typeof timelines)[number]) {
		closeMenu(timeline);
		renameTimelineDialog?.open(timeline);
	}

	function deleteTimeline(timeline: (typeof timelines)[number]) {
		closeMenu(timeline);
		delTimelineDialog?.open(timeline);
	}

	onMount(() => {
		const storedMode = localStorage.getItem("TimelinesView");
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
		localStorage.setItem("TimelinesView", viewMode);
	});
	$effect(() => {
		localStorage.setItem("SortFieldStatus", sortField);
	});
	$effect(() => {
		localStorage.setItem("SortDirectionStatus", sortDirection);
	});
</script>

{#snippet actionsMenu(
	timeline: (typeof timelines)[number],
	exportHref: string | null,
	exportListHref: string | null,
)}
	<button
		type="button"
		class="btn badge shrink-0 badge-ghost"
		aria-label="Timeline actions"
		popovertarget="timeline-menu-{timeline.id}"
		style="anchor-name: --timeline-anchor-{timeline.id}"
	>
		<Ellipsis />
	</button>

	<ul
		id="timeline-menu-{timeline.id}"
		popover
		class="menu dropdown dropdown-end z-50 w-56 rounded-box bg-base-100 p-2 text-left shadow-lg"
		style="position-anchor: --timeline-anchor-{timeline.id}"
	>
		{#if exportHref}
			<li>
				<a href={exportHref}>
					<FileDown class="size-4" />
					View latest export
				</a>
			</li>
			<li>
				<a href={exportListHref}>
					<List class="size-4" />
					All exports
				</a>
			</li>
		{:else}
			<li class="menu-disabled"><span>No exports yet</span></li>
		{/if}

		<li class="mt-1 border-t border-base-300 pt-1">
			<button type="button" onclick={() => renameTimeline(timeline)}>
				<Pencil class="size-4" />
				Rename timeline
			</button>
		</li>
		<li>
			<button type="button" class="text-error" onclick={() => deleteTimeline(timeline)}>
				<Trash class="size-4" />
				Delete timeline
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
					<p class="text-lg font-semibold">Loading your timelines</p>
					<p class="mt-1 text-sm text-base-content/70">
						Please wait while we get everything ready.
					</p>
				</div>
			</div>
		</div>
	{:else}
		<header class="flex justify-between border-b border-base-300 pb-4">
			<div class="flex gap-2">
				<h1 class="text-2xl font-bold">Your Timelines</h1>
				<button
					class="btn rounded-full btn-sm"
					aria-label="New timeline"
					onclick={() => timelineDialog?.open()}
				>
					<Plus />
				</button>
			</div>

			<div class="flex flex-wrap items-baseline gap-3">
				<div class="flex flex-wrap items-center gap-2">
					{#if viewMode == "card"}
						<label class="text-sm font-medium" for="timeline-sort">Sort by</label>
						<select id="timeline-sort" class="select-bordered select w-56" bind:value={sortField}>
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

		{@const sortedTimelines = [...timelines].sort((a, b) => {
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
						{#each sortedTimelines as timeline (timeline.id)}
							{@const { latest, exportHref, exportListHref } = exportLinks(timeline)}
							<tr class="hover:bg-base-200/60 [&>td]:align-middle">
								<td class="w-44">
									<div class="aspect-video w-36 overflow-hidden rounded-md bg-base-300">
										{#if latest?.media}
											<a
												href={exportHref}
												class="group relative block size-full"
												aria-label="Open latest export"
											>
												<img
													src={await getUrl({ mediaId: latest.media.id, type: "thumbnail" })}
													alt="Thumbnail of {timeline.name}"
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

								<td class="font-medium">{timeline.name}</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(timeline.createdAt).toLocaleDateString()}
								</td>
								<td class="whitespace-nowrap text-base-content/70">
									{new Date(timeline.updatedAt).toLocaleDateString()}
								</td>

								<td class="text-right whitespace-nowrap">
									{@render actionsMenu(timeline, exportHref, exportListHref)}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="py-8 text-center text-base-content/70">No timelines yet.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{#each sortedTimelines as timeline (timeline.id)}
					{@const { latest, exportHref, exportListHref } = exportLinks(timeline)}
					<article class="card h-full bg-base-100 shadow-xl">
						<figure class="group relative aspect-video overflow-hidden bg-base-300">
							{#if latest?.media}
								<a href={exportHref} class="block size-full" aria-label="Open latest export">
									<img
										src={await getUrl({ mediaId: latest.media.id, type: "thumbnail" })}
										alt="Thumbnail of {timeline.name}"
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
							<h2 class="card-title flex items-center justify-between">
								<span class="min-w-0 flex-1 truncate" title={timeline.name}>
									{timeline.name}
								</span>
								{@render actionsMenu(timeline, exportHref, exportListHref)}
							</h2>

							<dl class="space-y-1 text-sm text-base-content/70">
								<div class="flex justify-between gap-4">
									<dt>Created</dt>
									<dd>{new Date(timeline.createdAt).toLocaleDateString()}</dd>
								</div>
								<div class="flex justify-between gap-4">
									<dt>Last updated</dt>
									<dd>{new Date(timeline.updatedAt).toLocaleDateString()}</dd>
								</div>
							</dl>

							<div class="mt-4 card-actions justify-end">
								{#if exportHref}
									<a href={exportHref} class="btn btn-primary btn-sm">Open latest</a>
								{:else}
									<span class="text-sm text-base-content/70">No exports yet</span>
								{/if}
							</div>
						</div>
					</article>
				{:else}
					<p class="text-base-content/70">No timelines yet.</p>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<NewTimelineModal bind:this={timelineDialog} projectId={page.params.project!} />
<RenameTimelineModal bind:this={renameTimelineDialog} projectId={page.params.project!} />
<DeleteTimelineModal bind:this={delTimelineDialog} />
