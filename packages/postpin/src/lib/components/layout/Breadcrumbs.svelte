<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import Link from "@lucide/svelte/icons/link";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import { getShareLinks } from "#lib/components/sharing/share-links/share-links.remote.ts";
	import {
		getBreadcrumbNames,
		getExportSiblings,
		getProjectSiblings,
		getTimelineSiblings,
	} from "./breadcrumbs.remote.ts";

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

	// Sibling lists load only once their dropdown has been opened
	type Level = "project" | "timeline" | "export";
	let opened = $state<Record<Level, boolean>>({ project: false, timeline: false, export: false });

	const projectSiblings = $derived(
		opened.project && projectId ? getProjectSiblings(projectId) : undefined,
	);
	const timelineSiblings = $derived(
		opened.timeline && projectId ? getTimelineSiblings(projectId) : undefined,
	);
	const exportSiblings = $derived(
		opened.export && timelineId ? getExportSiblings(timelineId) : undefined,
	);
</script>

{#snippet shareButton(label: string, onclick: () => void, count = 0, linkIcon = false)}
	<button
		type="button"
		class="btn btn-ghost btn-xs {count ? 'gap-1 px-1.5' : 'btn-square'}"
		title={label}
		aria-label={count ? `${label} (${count} active links)` : label}
		{onclick}
	>
		{#if linkIcon}
			<Link class="size-3.5" />
		{:else}
			<UserGroup class="size-3.5" />
		{/if}
		{#if count}<span>{count}</span>{/if}
	</button>
{/snippet}

{#snippet siblingMenu(
	level: Level,
	label: string,
	items: { id: string; name: string }[] | undefined,
	currentId: string,
	href: (id: string) => string,
)}
	<div class="group dropdown">
		<div
			tabindex="0"
			role="button"
			class="btn btn-square btn-ghost text-base-content/50 btn-xs"
			title={label}
			aria-label={label}
			onfocus={() => (opened[level] = true)}
		>
			<ChevronRight class="size-3.5 transition-transform group-focus-within:rotate-90" />
		</div>
		<ul
			tabindex="-1"
			class="menu dropdown-content z-20 mt-1 max-h-80 w-64 flex-nowrap overflow-y-auto rounded-box bg-base-100 p-2 shadow"
		>
			{#if !items}
				<li class="disabled"><span class="loading loading-xs loading-spinner"></span></li>
			{:else}
				{#each items as item (item.id)}
					<li>
						<a
							href={href(item.id)}
							class:menu-active={item.id === currentId}
							aria-current={item.id === currentId ? "page" : undefined}
						>
							<span class="truncate" title={item.name}>{item.name}</span>
						</a>
					</li>
				{/each}
			{/if}
		</ul>
	</div>
{/snippet}

{#if projectId && names}
	{@const { project, timeline, export: exp } = names}
	<nav aria-label="Breadcrumb" class="min-w-0">
		<ol class="flex min-w-0 items-center text-sm">
			<li class="flex min-w-0 items-center gap-1">
				{@render siblingMenu(
					"project",
					"Switch project",
					projectSiblings?.current,
					project.id,
					(id) => resolve("/(root)/projects/[project]", { project: id }),
				)}
				<a
					href={resolve("/(root)/projects/[project]", { project: project.id })}
					class="block max-w-48 truncate hover:underline"
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
				<li class="flex min-w-0 items-center gap-1">
					{@render siblingMenu(
						"timeline",
						"Switch timeline",
						timelineSiblings?.current,
						timeline.id,
						(id) =>
							resolve("/(root)/projects/[project]/timelines/[timeline]/exports", {
								project: project.id,
								timeline: id,
							}),
					)}
					<a
						href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports", {
							project: project.id,
							timeline: timeline.id,
						})}
						class="block max-w-48 truncate hover:underline"
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
					<li class="flex min-w-0 items-center gap-1">
						{@render siblingMenu("export", "Switch export", exportSiblings?.current, exp.id, (id) =>
							resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
								project: project.id,
								timeline: timeline.id,
								export: id,
							}),
						)}
						<a
							href={resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
								project: project.id,
								timeline: timeline.id,
								export: exp.id,
							})}
							class="block max-w-48 truncate hover:underline"
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
								true,
							)}
						{/if}
					</li>
				{/if}
			{/if}
		</ol>
	</nav>
{/if}

<SharingSetupModal bind:this={sharingModal} />
