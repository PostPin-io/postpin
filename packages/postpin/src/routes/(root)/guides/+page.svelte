<script lang="ts">
	// PostPin Guides: every tutorial and tour with its status, each can be started (again).
	// One filter for both columns: people look for a topic, not for a kind of guide.
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Search from "@lucide/svelte/icons/search";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { getGuideProgress, restartGuide } from "#lib/components/guides/guides.remote.ts";
	import { GUIDES, GUIDE_STYLE, type GuideType } from "#lib/guides.ts";
	import { matchesGuide } from "./filter.ts";

	const progress = $derived(await getGuideProgress());

	const STATUS_LABELS: Record<GuideStatus | "NEW", string> = {
		NEW: "Not started",
		[GuideStatus.STARTED]: "In progress",
		[GuideStatus.COMPLETED]: "Completed",
		[GuideStatus.SKIPPED]: "Skipped",
	};

	let query = $state("");
	let started = $state<string | null>(null);
	let busy = $state(false);

	const COLUMNS: { type: GuideType; title: string; text: string }[] = [
		{ type: "tutorial", title: "Tutorials", text: "The basics of PostPin, step by step." },
		{ type: "tour", title: "Tours", text: "One feature at a time, right where it is." },
	];

	async function start(guide: (typeof GUIDES)[number]) {
		busy = true;
		try {
			// done or skipped: as if never started, so it starts on its own where it runs;
			// one in progress goes on where it was
			const status = progress[guide.id]?.status;
			if (status === GuideStatus.COMPLETED || status === GuideStatus.SKIPPED) {
				await restartGuide(guide.id);
			}
			if ("href" in guide) await goto(resolve(guide.href));
			else started = guide.id;
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
		<label class="input w-full sm:w-72">
			<Search class="size-4 opacity-60" />
			<input
				type="search"
				placeholder="Filter guides"
				aria-label="Filter guides"
				bind:value={query}
			/>
		</label>
	</header>

	<div class="grid gap-6 md:grid-cols-2">
		{#each COLUMNS as column (column.type)}
			{@const style = GUIDE_STYLE[column.type]}
			{@const guides = GUIDES.filter((g) => g.type === column.type && matchesGuide(g, query))}
			<section class="flex flex-col gap-3" aria-labelledby="guides-{column.type}">
				<div>
					<h2 id="guides-{column.type}" class="flex items-center gap-2 text-lg font-bold">
						<span class="size-2.5 rounded-full {style.dot}"></span>
						{column.title}
					</h2>
					<p class="text-sm text-base-content/70">{column.text}</p>
				</div>

				{#each guides as guide (guide.id)}
					{@const status = progress[guide.id]?.status ?? "NEW"}
					<article
						class="card border border-l-4 border-base-300 bg-base-100 shadow-sm {style.border}"
					>
						<div class="card-body gap-2 p-4">
							<div class="flex items-start gap-3">
								<GraduationCap class="mt-0.5 size-5 shrink-0 {style.text}" />
								<div class="min-w-0 flex-1">
									<h3 class="font-semibold">{guide.title}</h3>
									<p class="text-sm text-base-content/70">{guide.description}</p>
								</div>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<span class="badge badge-sm {style.badge}">{style.label}</span>
								<span class="text-xs text-base-content/60">{STATUS_LABELS[status]}</span>
								<span class="flex-1"></span>
								<button
									type="button"
									class="btn btn-sm {style.button}"
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
							{#if started === guide.id}
								<p class="text-sm text-success">{guide.restartHint}</p>
							{/if}
						</div>
					</article>
				{:else}
					<p
						class="rounded-box border border-dashed border-base-300 p-4 text-sm text-base-content/60"
					>
						{query.trim()
							? `No ${column.title.toLowerCase()} match “${query.trim()}”.`
							: `No ${column.title.toLowerCase()} yet.`}
					</p>
				{/each}
			</section>
		{/each}
	</div>
</div>
