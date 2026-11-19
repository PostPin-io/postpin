<script lang="ts">
	import type { Component } from "svelte";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { afterNavigate } from "$app/navigation";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import Link from "@lucide/svelte/icons/link";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import GuideButton from "#lib/components/guides/GuideButton.svelte";
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

	// Awaited instead of read through `.current`: the pages await their own queries, which keeps
	// the navigation pending. A `.current` value arriving in the meantime is a separate update that
	// Svelte fails to combine with the pending one, leaving the breadcrumbs on the previous page
	// until a reload. Awaiting makes them part of the navigation, so both change together.
	const names = $derived(await namesQuery?.catch(loadFailed));

	const shareLinks = $derived(
		names?.export?.canShare ? await getShareLinks(names.export.id).catch(loadFailed) : undefined,
	);
	/** Number of active share links next to the export's share button */
	const shareLinkCount = $derived(
		shareLinks?.filter((link) => link.status === "active").length ?? 0,
	);

	// A failed query must not take the page down with it: the breadcrumbs just stay hidden
	function loadFailed(error: unknown) {
		console.error("Could not load breadcrumbs", error);
		return undefined;
	}

	// The failure stays cached for these params, so try again on the next navigation
	afterNavigate(() => {
		if (namesQuery?.error) void namesQuery.refresh().catch(() => {});
	});

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
	/** The other items on each level, for the dropdown behind the chevron */
	const siblingQueries = $derived({
		project: projectSiblings,
		timeline: timelineSiblings,
		export: exportSiblings,
	});

	// Reload on every open: items created, renamed or deleted elsewhere would otherwise
	// be missing from the cached list. The stale list stays visible while it reloads.
	function openMenu(level: Level) {
		if (opened[level]) refreshSiblings(level);
		else opened[level] = true;
	}

	function refreshSiblings(level: Level) {
		// A failure shows up as the query's `error`
		siblingQueries[level]?.refresh().catch(() => {});
	}

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
		// Read on every page, not just on exports: Svelte reports an awaited value nobody reads
		const linkCount = shareLinkCount;
		if (!names) return [];
		const { project, timeline, export: exp } = names;

		const result: Crumb[] = [
			{
				level: "project",
				id: project.id,
				name: project.name,
				href: projectHref(project.id),
				siblingHref: projectHref,
				share: project.canShare
					? {
							label: "Invite to project",
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
			siblingHref: (id) => timelineHref(project.id, id),
			share: timeline.canShare
				? {
						label: "Invite to timeline",
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
			siblingHref: (id) => exportHref(project.id, timeline.id, id),
			share: exp.canShare
				? {
						label: "Share links",
						icon: Link,
						count: linkCount,
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
	{@const siblings = siblingQueries[crumb.level]}
	<!--
		Mobile: the switcher follows the name as a "down" chevron (the back link already sits in
		front of it), and the list spans the header's width instead of hanging off the chevron,
		where it would run off narrow screens. `static` anchors it to the navbar for that.
	-->
	<div class="group dropdown max-lg:static max-lg:order-1">
		<div
			tabindex="0"
			role="button"
			class="btn btn-square btn-ghost text-base-content/50 btn-sm lg:btn-xs"
			title="Switch {crumb.level}"
			aria-label="Switch {crumb.level}"
			data-guide={crumb.level === "project" ? undefined : "navigation/switcher"}
			onfocus={() => openMenu(crumb.level)}
		>
			<ChevronRight
				class="size-4 transition-transform max-lg:rotate-90 max-lg:group-focus-within:-rotate-90 lg:size-3.5 lg:group-focus-within:rotate-90"
			/>
		</div>
		<ul
			tabindex="-1"
			class="menu dropdown-content z-20 mt-1 max-h-80 w-64 max-w-[calc(100vw-2rem)] flex-nowrap overflow-y-auto rounded-box bg-base-100 p-2 shadow max-lg:inset-x-2 max-lg:top-full max-lg:w-auto max-lg:max-w-none"
		>
			{#if siblings?.current}
				{#each siblings.current as item (item.id)}
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
			{:else if siblings?.error}
				<li class="menu-title text-error">Could not load {crumb.level}s</li>
				<li><button type="button" onclick={() => refreshSiblings(crumb.level)}>Retry</button></li>
			{:else}
				<li class="menu-disabled"><span class="loading loading-xs loading-spinner"></span></li>
			{/if}
		</ul>
	</div>
{/snippet}

{#if crumbs.length}
	<nav aria-label="Breadcrumb" class="min-w-0" data-guide="navigation/breadcrumbs">
		<ol class="flex min-w-0 items-center text-sm">
			<!-- Mobile: only the current segment, plus a back link to its parent -->
			<li class="lg:hidden">
				<a
					href={crumbs.at(-2)?.href ?? resolve("/(root)/dashboard")}
					class="btn btn-square btn-ghost btn-sm"
					aria-label="Back"
					data-guide="navigation/back"
					title="Back"
				>
					<ChevronLeft class="size-4" />
				</a>
			</li>
			{#each crumbs as crumb, i (crumb.level)}
				{@const isCurrent = i === crumbs.length - 1}
				<li class="flex min-w-0 items-center gap-1 {isCurrent ? '' : 'max-lg:hidden'}">
					{@render siblingMenu(crumb)}
					<a
						href={crumb.href}
						class="block max-w-[45vw] truncate hover:underline lg:max-w-48"
						title={crumb.name}
						aria-current={isCurrent ? "page" : undefined}
					>
						{crumb.name}
					</a>
					{#if crumb.share}
						{@const { label, icon: Icon, count, open } = crumb.share}
						<button
							type="button"
							class="btn btn-ghost btn-sm max-lg:order-2 lg:btn-xs {count
								? 'gap-1 px-1.5'
								: 'btn-square'}"
							title={label}
							aria-label={count ? `${label} (${count} active links)` : label}
							data-guide={crumb.level === "export" ? "share-link/open" : undefined}
							onclick={open}
						>
							<Icon class="size-3.5" />
							{#if count}<span>{count}</span>{/if}
						</button>
						{#if crumb.level === "export"}
							<!-- the tour starts at the share button right before it -->
							<GuideButton guide="share-link" class="max-lg:order-3" />
						{/if}
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}

<SharingSetupModal bind:this={sharingModal} />
