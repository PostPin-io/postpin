<script lang="ts">
	// PostPin Guides: every tutorial and tour with its status, each can be started (again).
	// One filter for both columns: people look for a topic, not for a kind of guide.
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Info from "@lucide/svelte/icons/info";
	import ListTodo from "@lucide/svelte/icons/list-todo";
	import Search from "@lucide/svelte/icons/search";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import {
		getGuideProgress,
		getGuidesEnabled,
		restartGuide,
		setGuidesEnabled,
	} from "#lib/components/guides/guides.remote.ts";
	import { guideState, requestGuide, statusOf } from "#lib/components/guides/guide-state.svelte.ts";
	import { GUIDES, GUIDE_STYLE, type GuideType } from "#lib/guides.ts";
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
			if (!("startFrom" in guide)) {
				// a tour of a feature starts at the feature, from its guide button
				started = guide.id;
			} else {
				// started by hand: runs also while guides are switched off
				requestGuide(guide.id);
				if (guide.startFrom !== "here") await goto(resolve(guide.startFrom.href));
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
			<h1 class="flex items-center gap-2 text-2xl font-bold">
				<GraduationCap class="size-7" />
				PostPin Guides
			</h1>
			<p class="mt-1 text-base-content/70">Start any tutorial or tour, as often as you like.</p>
		</div>
		<div class="flex w-full gap-2 sm:w-auto">
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

	<label
		class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 bg-base-100 p-3"
	>
		<input
			type="checkbox"
			class="toggle mt-0.5 shrink-0 border-base-content/40 bg-base-300 text-base-content toggle-sm checked:border-primary checked:bg-primary checked:text-primary-content"
			checked={enabled}
			onchange={(e) => toggleGuides(e.currentTarget.checked)}
		/>
		<span class="min-w-0">
			<span class="block text-sm font-semibold">Guides {enabled ? "on" : "off"}</span>
			<span class="block text-sm text-base-content/70">
				{enabled
					? "Tutorials start on their own, and tours have a guide button next to their feature."
					: "Nothing starts on its own and there are no guide buttons. You can still start any guide here."}
			</span>
		</span>
	</label>

	<div class="grid gap-6 md:grid-cols-2">
		{#each COLUMNS as column (column.type)}
			{@const style = GUIDE_STYLE[column.type]}
			{@const guides = GUIDES.filter((g) => g.type === column.type && shown(g))}
			<section class="flex flex-col gap-2" aria-labelledby="guides-{column.type}">
				<div>
					<h2 id="guides-{column.type}" class="flex items-center gap-2 text-lg font-bold">
						<span class="size-2.5 rounded-full {style.dot}"></span>
						{column.title}
					</h2>
					<p class="text-sm text-base-content/70">{column.text}</p>
				</div>

				{#each guides as guide (guide.id)}
					{@const status = statusOf(progress, guide.id) ?? "NEW"}
					<article
						class="rounded-box border border-l-4 border-base-300 bg-base-100 px-3 py-2 {style.border}"
					>
						<div class="flex items-center gap-2">
							<GraduationCap class="size-4 shrink-0 {style.text}" />
							<h3 class="min-w-0 truncate text-sm font-semibold" title={guide.title}>
								{guide.title}
							</h3>
							<button
								type="button"
								class="btn btn-square shrink-0 btn-ghost btn-xs {infoOpen === guide.id
									? 'btn-active'
									: ''}"
								title="About this guide"
								aria-label="About {guide.title}"
								aria-expanded={infoOpen === guide.id}
								aria-controls="guide-info-{guide.id}"
								onclick={() => (infoOpen = infoOpen === guide.id ? null : guide.id)}
							>
								<Info class="size-3.5" />
							</button>
							<span class="flex-1"></span>
							<span class="shrink-0 text-xs whitespace-nowrap text-base-content/60">
								{STATUS_LABELS[status]}
							</span>
							<button
								type="button"
								class="btn shrink-0 btn-xs {style.button}"
								disabled={busy}
								onclick={() => start(guide)}
							>
								{status === "NEW"
									? "Start"
									: status === GuideStatus.STARTED
										? "Continue"
										: "Start again"}
							</button>
						</div>
						{#if infoOpen === guide.id}
							<p id="guide-info-{guide.id}" class="mt-1 pl-6 text-sm text-base-content/70">
								{guide.description}
							</p>
						{/if}
						{#if started === guide.id}
							<p class="mt-1 pl-6 text-sm {enabled ? 'text-success' : 'text-warning'}">
								{enabled
									? guide.restartHint
									: "Guides are switched off: switch them on to get its guide button."}
							</p>
						{/if}
					</article>
				{:else}
					<p
						class="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/60"
					>
						{query.trim()
							? `No ${column.title.toLowerCase()} match “${query.trim()}”.`
							: openOnly
								? `All ${column.title.toLowerCase()} completed.`
								: `No ${column.title.toLowerCase()} yet.`}
					</p>
				{/each}
			</section>
		{/each}
	</div>
</div>
