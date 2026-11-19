<script lang="ts">
	// PostPin Guides: every tutorial and tour with its status, each can be started (again).
	// One filter for both columns: people look for a topic, not for a kind of guide.
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Compass from "@lucide/svelte/icons/compass";
	import Unplug from "@lucide/svelte/icons/unplug";
	import Info from "@lucide/svelte/icons/info";
	import Link from "@lucide/svelte/icons/link";
	import Upload from "@lucide/svelte/icons/upload";
	import ListTodo from "@lucide/svelte/icons/list-todo";
	import Search from "@lucide/svelte/icons/search";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import {
		getGuideProgress,
		getGuidesEnabled,
		getGuideStart,
		restartGuide,
		setGuidesEnabled,
	} from "#lib/components/guides/guides.remote.ts";
	import { guideState, requestGuide, statusOf } from "#lib/components/guides/guide-state.svelte.ts";
	import { GUIDES, GUIDE_STYLE, type GuideId, type GuideType } from "#lib/guides.ts";
	import type { Component } from "svelte";
	import { matchesGuide } from "./filter.ts";

	const progress = $derived(await getGuideProgress());
	const storedEnabled = $derived(await getGuidesEnabled());
	const enabled = $derived(guideState.enabled ?? storedEnabled);

	async function toggleGuides(on: boolean) {
		guideState.enabled = on;
		// switched off: a running guide disappears at once (it stays "in progress")
		if (!on) guideState.requested = null;
		try {
			await setGuidesEnabled(on);
		} catch {
			guideState.enabled = null;
		}
	}

	/** What each guide is about, at a glance; the guide button keeps the graduation cap */
	const GUIDE_ICONS: Record<GuideId, Component<{ class?: string }>> = {
		"first-upload": Upload,
		"install-resolve": Unplug,
		"install-premiere": Unplug,
		"install-desktop": Unplug,
		"postpin-guides": GraduationCap,
		navigation: Compass,
		"share-link": Link,
	};

	const STATUS_LABELS: Record<GuideStatus | "NEW", string> = {
		NEW: "Not started",
		[GuideStatus.STARTED]: "In progress",
		[GuideStatus.COMPLETED]: "Completed",
		[GuideStatus.SKIPPED]: "Skipped",
	};

	let query = $state("");
	/** Only what isn't completed yet: with many guides, what's left is what matters */
	let openOnly = $state(false);
	/** The guide whose description is shown; rows stay one line otherwise */
	let infoOpen = $state<string | null>(null);

	const shown = (guide: (typeof GUIDES)[number]) =>
		matchesGuide(guide, query) &&
		(!openOnly || statusOf(progress, guide.id) !== GuideStatus.COMPLETED);
	let started = $state<string | null>(null);
	let busy = $state(false);

	const COLUMNS: { type: GuideType; title: string; text: string }[] = [
		{ type: "tutorial", title: "Tutorials", text: "The basics of PostPin, step by step." },
		{ type: "tour", title: "Tours", text: "One feature at a time, right where it is." },
	];

	async function start(guide: (typeof GUIDES)[number]) {
		busy = true;
		try {
			// done or skipped: as if never started (a tour gets its guide button back);
			// one in progress goes on where it was
			const status = statusOf(progress, guide.id);
			if (status === GuideStatus.COMPLETED || status === GuideStatus.SKIPPED) {
				await restartGuide(guide.id);
			}
			// started by hand: runs also while guides are switched off. Always where its first step
			// is, so nobody has to go looking for the feature first.
			if (guide.startFrom === "here") {
				requestGuide(guide.id);
			} else if (guide.startFrom === "found") {
				// fresh: the export it found last time may be gone
				const startQuery = getGuideStart(guide.id);
				await startQuery.refresh();
				const href = await startQuery;
				if (!href) {
					// nothing to start it on yet (e.g. no export to share)
					started = guide.id;
					return;
				}
				// first there, then the request: leaving a page drops a tour requested on it
				await goto(href);
				requestGuide(guide.id);
			} else {
				requestGuide(guide.id);
				await goto(resolve(guide.startFrom.href));
			}
		} finally {
			busy = false;
		}
	}
</script>

<PageMeta title="PostPin Guides" description="Tutorials and tours for PostPin." />

<div class="flex flex-col gap-6">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<h1 class="flex items-center gap-2 text-2xl font-bold">
					<GraduationCap class="size-7" />
					PostPin Guides
				</h1>
				<!-- what on and off mean is explained by the postpin-guides tour (and the tooltip) -->
				<label
					class="flex cursor-pointer items-center gap-2 text-sm font-semibold"
					title={enabled
						? "Tutorials start on their own, tours have guide buttons"
						: "Nothing starts on its own, no guide buttons"}
					data-guide="postpin-guides/switch"
				>
					<input
						type="checkbox"
						class="toggle shrink-0 border-base-content/40 bg-base-300 text-base-content toggle-sm checked:border-primary checked:bg-primary checked:text-primary-content"
						checked={enabled}
						onchange={(e) => toggleGuides(e.currentTarget.checked)}
					/>
					Guides {enabled ? "on" : "off"}
				</label>
			</div>
			<p class="mt-1 text-base-content/70">Start any tutorial or tour, as often as you like.</p>
		</div>
		<div class="flex w-full gap-2 sm:w-auto" data-guide="postpin-guides/filter">
			<label class="input min-w-0 flex-1 sm:w-72">
				<Search class="size-4 opacity-60" />
				<input
					type="search"
					placeholder="Filter guides"
					aria-label="Filter guides"
					bind:value={query}
				/>
			</label>
			<button
				type="button"
				class="btn shrink-0 {openOnly ? 'btn-neutral' : ''}"
				aria-pressed={openOnly}
				title="Only guides you haven't completed"
				onclick={() => (openOnly = !openOnly)}
			>
				<ListTodo class="size-4" />
				Not completed
			</button>
		</div>
	</header>

	<div class="grid gap-6 md:grid-cols-2">
		{#each COLUMNS as column (column.type)}
			{@const style = GUIDE_STYLE[column.type]}
			{@const guides = GUIDES.filter((g) => g.type === column.type && shown(g))}
			<section
				aria-labelledby="guides-{column.type}"
				data-guide="postpin-guides/{column.type === 'tutorial' ? 'tutorials' : 'tours'}"
			>
				<ul class="list rounded-box border border-base-300 bg-base-100 shadow-sm">
					<li class="flex flex-col gap-0.5 p-4 pb-2">
						<h2 id="guides-{column.type}" class="flex items-center gap-2 font-bold">
							<span class="size-2.5 rounded-full {style.dot}"></span>
							{column.title}
							<span class="text-xs font-normal text-base-content/50">{guides.length}</span>
						</h2>
						<p class="text-xs text-base-content/60">{column.text}</p>
					</li>

					{#each guides as guide, i (guide.id)}
						{@const status = statusOf(progress, guide.id) ?? "NEW"}
						{@const GuideIcon = GUIDE_ICONS[guide.id]}
						<li class="list-row items-center">
							<div class="grid size-9 place-items-center rounded-box {style.tile}">
								<GuideIcon class="size-5 {style.text}" />
							</div>
							<div class="min-w-0">
								<h3 class="truncate text-sm font-semibold" title={guide.title}>{guide.title}</h3>
								<div
									class="flex items-center gap-1 text-xs font-semibold tracking-wide uppercase {status ===
									GuideStatus.STARTED
										? style.text
										: status === GuideStatus.COMPLETED
											? 'text-success'
											: 'text-base-content/50'}"
								>
									{#if status === GuideStatus.COMPLETED}<CircleCheck class="size-3.5" />{/if}
									{STATUS_LABELS[status]}
								</div>
							</div>
							<button
								type="button"
								class="btn btn-square btn-ghost btn-sm {infoOpen === guide.id ? 'btn-active' : ''}"
								title="About this guide"
								aria-label="About {guide.title}"
								aria-expanded={infoOpen === guide.id}
								aria-controls="guide-info-{guide.id}"
								onclick={() => (infoOpen = infoOpen === guide.id ? null : guide.id)}
							>
								<Info class="size-4" />
							</button>
							<button
								type="button"
								class="btn btn-sm {status === GuideStatus.COMPLETED ||
								status === GuideStatus.SKIPPED
									? 'btn-ghost'
									: style.button}"
								disabled={busy}
								data-guide={column.type === "tour" && i === 0 ? "postpin-guides/start" : undefined}
								onclick={() => start(guide)}
							>
								{status === "NEW"
									? "Start"
									: status === GuideStatus.STARTED
										? "Continue"
										: "Start again"}
							</button>
							{#if infoOpen === guide.id || started === guide.id}
								<!-- placed by hand under title, info and button: the list's own column flow
								     would squeeze the title column instead -->
								<div class="col-span-3 col-start-2 row-start-2 flex flex-col gap-1 text-xs">
									{#if infoOpen === guide.id}
										<p id="guide-info-{guide.id}" class="text-base-content/70">
											{guide.description}
										</p>
									{/if}
									{#if started === guide.id}
										<p class={enabled ? "text-success" : "text-warning"} role="status">
											{enabled
												? guide.restartHint
												: "Guides are switched off: switch them on to get its guide button."}
										</p>
									{/if}
								</div>
							{/if}
						</li>
					{:else}
						<li class="list-row text-sm text-base-content/60">
							<span class="list-col-grow">
								{query.trim()
									? `No ${column.title.toLowerCase()} match “${query.trim()}”.`
									: openOnly
										? `All ${column.title.toLowerCase()} completed.`
										: `No ${column.title.toLowerCase()} yet.`}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
