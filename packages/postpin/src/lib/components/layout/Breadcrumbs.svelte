<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { getBreadcrumbNames } from "./breadcrumbs.remote.ts";
	import Share from "@lucide/svelte/icons/share";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import { getShareLinks } from "#lib/components/sharing/share-links/share-links.remote.ts";

	let sharingModal: SharingSetupModal | null = null;

	// Anzahl aktiver Share-Links neben dem Export-Button (aus Header.svelte übernommen)
	const shareLinksQuery = $derived(
		names?.export?.canShare ? getShareLinks(names.export.id) : undefined,
	);
	const shareLinkCount = $derived(
		shareLinksQuery?.current?.filter((link) => link.status === "active").length ?? 0,
	);

	const projectId = $derived(page.params.project);
	const timelineId = $derived(page.params.timeline);
	const exportId = $derived(page.params.export);

	const namesQuery = $derived(
		projectId ? getBreadcrumbNames({ projectId, timelineId, exportId }) : undefined,
	);
	const names = $derived(namesQuery?.current);
</script>

{#snippet shareButton(label: string, onclick: () => void, count = 0)}
	<button
		type="button"
		class="btn btn-ghost btn-xs {count ? 'gap-1 px-1.5' : 'btn-square'}"
		title={label}
		aria-label={count ? `${label} (${count} active links)` : label}
		{onclick}
	>
		<Share class="size-3.5" />
		{#if count}<span>{count}</span>{/if}
	</button>
{/snippet}

{#if projectId && names}
	<div class="breadcrumbs min-w-0 text-sm">
		<ul>
			<li class="min-w-0">
				<a
                
					href={resolve("/(root)/projects/[project]", { project: names.project.id })}
					class="block max-w-48 truncate"
					title={names.project.name}
					aria-current={!names.timeline ? "page" : undefined}
				>
					{names.project.name}
				</a><li class="min-w-0 gap-1">
	<a ...>{names.project.name}</a>
	{#if names.project.canShare}
		{@render shareButton("Share project", () =>
			sharingModal?.open({ projectId: names.project.id }),
		)}
	{/if}
</li>

                
			</li>
			{#if names.timeline}
				<li class="min-w-0">
					<a
						href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports", {
							project: names.project.id,
							timeline: names.timeline.id,
						})}
						class="block max-w-48 truncate"
						title={names.timeline.name}
						aria-current={!names.export ? "page" : undefined}
					>
						{names.timeline.name}
					</a>{#if names.timeline.canShare}
	{@render shareButton("Share timeline", () =>
		sharingModal?.open({ projectId: names.project.id, timelineId: names.timeline!.id }),
	)}
{/if}

				</li>
			{/if}
			{#if names.timeline && names.export}
				<li class="min-w-0">
					<a
						href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
							project: names.project.id,
							timeline: names.timeline.id,
							export: names.export.id,
						})}
						class="block max-w-48 truncate"
						title={names.export.name}
						aria-current="page"
					>
						{names.export.name}
					</a>{#if names.export.canShare}
	{@render shareButton(
		"Share links",
		() =>
			sharingModal?.open({
				projectId: names.project.id,
				timelineId: names.timeline!.id,
				exportId: names.export!.id,
			}),
		shareLinkCount,
	)}
{/if}

				</li>
			{/if}

		</ul>
	</div>
{/if}
<SharingSetupModal bind:this={sharingModal} />
