<script lang="ts">
	import { page } from "$app/state";
	import { getTimelines } from "./timeline.remote.ts";
	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import { onMount } from "svelte";
	import { getUrl } from "../../videotests/videotests.remote.ts";
	import { goto } from "$app/navigation";

	let viewMode: "table" | "card" = $state("card");
	let sortField: "name" | "created" | "updated" = $state("updated");
	let sortDirection: "asc" | "desc" = $state("desc");
	import ImageIcon from "@lucide/svelte/icons/image";
	import Apeture from "@lucide/svelte/icons/aperture";

	let loadingStatus = $state(true);

	function sortBy(field: typeof sortField) {
		if (sortField == field) {
			sortDirection = sortDirection == "asc" ? "desc" : "asc";
		} else {
			sortField = field;
		}
	}
	onMount(() => {
		const storedMode = localStorage.getItem("TimelinesView");
		const storedFieldStatus = localStorage.getItem("SortFieldStatus");
		const storedDirectionStatus = localStorage.getItem("SortDirectionStatus");

		viewMode = storedMode == "table" ? "table" : "card";
		sortDirection = storedDirectionStatus == "desc" ? "desc" : "asc";
		switch (storedFieldStatus) {
			case "name":
				sortField = storedFieldStatus;
				break;
			case "updated":
				sortField = storedFieldStatus;
				break;
			case "created":
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

<div class="flex h-full w-full flex-col gap-6 p-6">
	{#if loadingStatus == true}
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
			<h1 class="text-2xl font-bold">Your Timelines</h1>

			<div class="gap 2 flex flex-wrap items-baseline gap-3">
				<div class="flex flex-wrap items-center gap-2">
					{#if viewMode == "card"}
						<label class="text-sm font-medium" for="timeline-sort">Sort by</label>
						<select id="timeline-sort" class="select-bordered select w-56" bind:value={sortField}>
							<option value="name">Name</option>
							<option value="created">Created</option>
							<option value="updated">Updated</option>
						</select>

						<button
							onclick={() => {
								sortDirection = sortDirection == "asc" ? "desc" : "asc";
							}}
						>
							{#if sortDirection == "asc"}
								<ChevronUp></ChevronUp>
							{:else}
								<ChevronDown></ChevronDown>
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

		{#await getTimelines(page.params.project || "")}
			<p class="text-base-content/70">Loading timelines...</p>
		{:then timelines}
			{@const sortedTimelines = [...timelines].sort((a, b) => {
				const comparison = sortField.startsWith("name")
					? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
					: sortField.startsWith("created")
						? a.createdAt.getTime() - b.createdAt.getTime()
						: a.updatedAt.getTime() - b.updatedAt.getTime();

				return (sortDirection == "asc" ? 1 : -1) * comparison || a.id.localeCompare(b.id);
			})}
			{#if viewMode === "table"}
				{#snippet chevronToggle(field: typeof sortField)}
					{#if sortField == field}
						{#if sortDirection == "asc"}
							<ChevronUp size={15}></ChevronUp>
						{:else}
							<ChevronDown size={15}></ChevronDown>
						{/if}
					{/if}
				{/snippet}

				<div class="overflow-x-auto rounded-box bg-base-100 shadow">
					<div class="overflow-x-auto rounded-box border border-base-content/10 bg-base-100">
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
									<th><span class="sr-only">Latest export</span></th>
								</tr>
							</thead>

							<tbody>
								{#each sortedTimelines as timeline (timeline.id)}
									{@const latest = timeline.exports[0]}
									{@const exportHref = latest
										? `/projects/${page.params.project}/timelines/${timeline.id}/exports/${latest.id}`
										: null}
									{@const exportListHref = latest
										? `/projects/${page.params.project}/timelines/${timeline.id}/exports/exportlist`
										: null}
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
													<div
														class="flex size-full items-center justify-center text-base-content/30"
													>
														<Apeture></Apeture>
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
											{#if exportHref}
												<div class="flex items-center justify-end gap-2">
													<a href={exportListHref} class="btn btn-ghost btn-sm">All exports</a>
													<a href={exportHref} class="btn btn-primary btn-sm">View latest export</a>
												</div>
											{:else}
												<span class="text-sm text-base-content/70">No exports yet</span>
											{/if}
										</td>
									</tr>
								{:else}
									<tr>
										<td colspan="5" class="py-8 text-center text-base-content/70"
											>No timelines yet.</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{:else}
				<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{#each sortedTimelines as timeline (timeline.id)}
						{@const latest = timeline.exports[0]}
						{@const exportHref = latest
							? `/projects/${page.params.project}/timelines/${timeline.id}/exports/${latest.id}`
							: null}
						{@const exportListHref = latest
							? `/projects/${page.params.project}/timelines/${timeline.id}/exports/exportlist`
							: null}
						<article class="card h-full overflow-hidden bg-base-100 shadow-xl">
							<!-- Thumbnail -->
							<figure class="group relative aspect-video bg-base-300">
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
										<Apeture></Apeture>
									</div>
								{/if}
							</figure>

							<div class="card-body">
								<h2 class="card-title">{timeline.name}</h2>

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

								<div class="mt-4 card-actions flex items-center justify-between gap-2">
									{#if exportHref}
										<a href={exportListHref} class="btn btn-ghost btn-sm">All exports</a>
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
		{/await}
	{/if}
</div>
