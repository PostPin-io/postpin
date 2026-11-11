<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import Share from "@lucide/svelte/icons/share";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import { getShareLinks } from "#lib/components/sharing/share-links/share-links.remote.ts";
	import { getBreadcrumbNames } from "./breadcrumbs.remote.ts";

	let sharingModal: SharingSetupModal | null = null;

	const projectId = $derived(page.params.project);
	const timelineId = $derived(page.params.timeline);
	const exportId = $derived(page.params.export);

	const namesQuery = $derived(
		projectId ? getBreadcrumbNames({ projectId, timelineId, exportId }) : undefined,
	);
	const names = $derived(namesQuery?.current);

	// Number of active share links next to the export's share button
	const shareLinksQuery = $derived(
		names?.export?.canShare ? getShareLinks(names.export.id) : undefined,
	);
	const shareLinkCount = $derived(
		shareLinksQuery?.current?.filter((link) => link.status === "active").length ?? 0,
	);
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
	{@const { project, timeline, export: exp } = names}
	<div class="breadcrumbs min-w-0 text-sm">
		<ul>
			<li class="min-w-0 gap-1">
				<a
					href={resolve("/(root)/projects/[project]", { project: project.id })}
					class="block max-w-48 truncate"
					title={project.name}
					aria-current={!timeline ? "page" : undefined}
				>
					{project.name}
				</a>
				{#if project.canShare}
					{@render shareButton("Share project", () =>
						sharingModal?.open({ projectId: project.id }),
					)}
				{/if}
			</li>
			{#if timeline}
				<li class="min-w-0 gap-1">
					<a
						href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports", {
							project: project.id,
							timeline: timeline.id,
						})}
						class="block max-w-48 truncate"
						title={timeline.name}
						aria-current={!exp ? "page" : undefined}
					>
						{timeline.name}
					</a>
					{#if timeline.canShare}
						{@render shareButton("Share timeline", () =>
							sharingModal?.open({ projectId: project.id, timelineId: timeline.id }),
						)}
					{/if}
				</li>
				{#if exp}
					<li class="min-w-0 gap-1">
						<a
							href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
								project: project.id,
								timeline: timeline.id,
								export: exp.id,
							})}
							class="block max-w-48 truncate"
							title={exp.name}
							aria-current="page"
						>
							{exp.name}
						</a>
						{#if exp.canShare}
							{@render shareButton(
								"Share links",
								() =>
									sharingModal?.open({
										projectId: project.id,
										timelineId: timeline.id,
										exportId: exp.id,
									}),
								shareLinkCount,
							)}
						{/if}
					</li>
				{/if}
			{/if}
		</ul>
	</div>
{/if}

<SharingSetupModal bind:this={sharingModal} />
