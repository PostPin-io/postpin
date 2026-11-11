<script lang="ts">
	import type { Component } from "svelte";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { afterNavigate } from "$app/navigation";
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
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";

	type Level = "project" | "timeline" | "export";
	type Item = { id: string; name: string };
	type Crumb = Item & {
		level: Level;
		href: string;
		/** The other items on this level, for the dropdown behind the chevron */
		siblings: Item[] | undefined;
		siblingHref: (id: string) => string;
		share?: { label: string; icon: Component; count?: number; open: () => void };
	};

	let sharingModal: SharingSetupModal | null = null;

	const projectId = $derived(page.params.project);
	const timelineId = $derived(page.params.timeline);
	const exportId = $derived(page.params.export);

	const namesQuery = $derived(
		projectId ? getBreadcrumbNames({ projectId, timelineId, exportId }) : undefined,
	);
	const names = $derived(namesQuery?.current);

	// A failed query leaves `.current` empty and stays cached for these params,
	// so the breadcrumbs would silently stay hidden. Log it and retry on the next navigation.
	$effect(() => {
		if (namesQuery?.error) console.error("Could not load breadcrumbs", namesQuery.error);
	});
	afterNavigate(() => {
		if (namesQuery?.error) void namesQuery.refresh();
	});

	// Number of active share links next to the export's share button
	const shareLinksQuery = $derived(
		names?.export?.canShare ? getShareLinks(names.export.id) : undefined,
	);
	const shareLinkCount = $derived(
		shareLinksQuery?.current?.filter((link) => link.status === "active").length ?? 0,
	);

	// Sibling lists load only once their dropdown has been opened
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

	const projectHref = (project: string) => resolve("/(root)/projects/[project]", { project });
	const timelineHref = (project: string, timeline: string) =>
		resolve("/(root)/projects/[project]/timelines/[timeline]/exports", { project, timeline });
	const exportHref = (project: string, timeline: string, exp: string) =>
		resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
			project,
			timeline,
			export: exp,
		});

	const crumbs = $derived.by((): Crumb[] => {
		if (!names) return [];
		const { project, timeline, export: exp } = names;

		const result: Crumb[] = [
			{
				level: "project",
				id: project.id,
				name: project.name,
				href: projectHref(project.id),
				siblings: projectSiblings?.current,
				siblingHref: projectHref,
				share: project.canShare
					? {
							label: "Share project",
							icon: UserGroup,
							open: () => sharingModal?.open({ projectId: project.id }),
						}
					: undefined,
			},
		];
		if (!timeline) return result;

		result.push({
			level: "timeline",
			id: timeline.id,
			name: timeline.name,
			href: timelineHref(project.id, timeline.id),
			siblings: timelineSiblings?.current,
			siblingHref: (id) => timelineHref(project.id, id),
			share: timeline.canShare
				? {
						label: "Share timeline",
						icon: UserGroup,
						open: () => sharingModal?.open({ projectId: project.id, timelineId: timeline.id }),
					}
				: undefined,
		});
		if (!exp) return result;

		result.push({
			level: "export",
			id: exp.id,
			name: exp.name,
			href: exportHref(project.id, timeline.id, exp.id),
			siblings: exportSiblings?.current,
			siblingHref: (id) => exportHref(project.id, timeline.id, id),
			share: exp.canShare
				? {
						label: "Share links",
						icon: Link,
						count: shareLinkCount,
						open: () =>
							sharingModal?.open({
								projectId: project.id,
								timelineId: timeline.id,
								exportId: exp.id,
							}),
					}
				: undefined,
		});
		return result;
	});
</script>

{#snippet siblingMenu(crumb: Crumb)}
	<div class="group dropdown">
		<div
			tabindex="0"
			role="button"
			class="btn btn-square btn-ghost text-base-content/50 btn-xs"
			title="Switch {crumb.level}"
			aria-label="Switch {crumb.level}"
			onfocus={() => (opened[crumb.level] = true)}
		>
			<ChevronRight class="size-3.5 transition-transform group-focus-within:rotate-90" />
		</div>
		<ul
			tabindex="-1"
			class="menu dropdown-content z-20 mt-1 max-h-80 w-64 flex-nowrap overflow-y-auto rounded-box bg-base-100 p-2 shadow"
		>
			{#if !crumb.siblings}
				<li class="disabled"><span class="loading loading-xs loading-spinner"></span></li>
			{:else}
				{#each crumb.siblings as item (item.id)}
					<li>
						<a
							href={crumb.siblingHref(item.id)}
							class:menu-active={item.id === crumb.id}
							aria-current={item.id === crumb.id ? "page" : undefined}
						>
							<span class="truncate" title={item.name}>{item.name}</span>
						</a>
					</li>
				{/each}
			{/if}
		</ul>
	</div>
{/snippet}

{#if crumbs.length}
	<nav aria-label="Breadcrumb" class="min-w-0">
		<ol class="flex min-w-0 items-center text-sm">
       
	<!-- Mobile: only the current segment, plus a back link to its parent -->
	<li class="lg:hidden">
		<a
			href={crumbs.at(-2)?.href ?? resolve("/(root)/dashboard")}
			class="btn btn-square btn-ghost btn-xs"
			aria-label="Back"
			title="Back"
		>
			<ChevronLeft class="size-4" />
		</a>
	</li>
	{#each crumbs as crumb, i (crumb.level)}
		{@const isCurrent = i === crumbs.length - 1}
		<li class="flex min-w-0 items-center gap-1 {isCurrent ? '' : 'max-lg:hidden'}">

			{#each crumbs as crumb, i (crumb.level)}
				{@const isCurrent = i === crumbs.length - 1}
				<li class="flex min-w-0 items-center gap-1">
					{@render siblingMenu(crumb)}
					<a
						href={crumb.href}
						class="block max-w-48 truncate hover:underline"
						title={crumb.name}
						aria-current={isCurrent ? "page" : undefined}
					>
						{crumb.name}
					</a>
					{#if crumb.share}
						{@const { label, icon: Icon, count, open } = crumb.share}
						<button
							type="button"
							class="btn btn-ghost btn-xs {count ? 'gap-1 px-1.5' : 'btn-square'}"
							title={label}
							aria-label={count ? `${label} (${count} active links)` : label}
							onclick={open}
						>
							<Icon class="size-3.5" />
							{#if count}<span>{count}</span>{/if}
						</button>
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<SharingSetupModal bind:this={sharingModal} />
