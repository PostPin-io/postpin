<script lang="ts">
	// The frame of every tutorial: full screen, so the one thing to do is all there is.
	// Dialogs opened from it (e.g. the upload) still show on top: they are in the top layer.
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import type { Snippet } from "svelte";
	import { GUIDES, GUIDE_STYLE, type GuideId } from "#lib/guides.ts";

	interface Props {
		guideId: GuideId;
		/** Labels of the steps, for the step bar */
		steps: readonly string[];
		current: number;
		onskip: () => void;
		children: Snippet;
	}
	let { guideId, steps, current, onskip, children }: Props = $props();

	const style = GUIDE_STYLE.tutorial;
	const title = $derived(GUIDES.find((g) => g.id === guideId)?.title ?? "");

	let confirmSkip = $state(false);
</script>

<div
	class="fixed inset-0 z-[60] overflow-y-auto bg-base-200"
	role="dialog"
	aria-modal="true"
	aria-label="{style.label}: {title}"
>
	<div class="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-6 sm:py-10">
		<header class="flex items-center gap-3">
			<span
				class="flex size-9 items-center justify-center rounded-full {style.dot} text-primary-content"
			>
				<GraduationCap class="size-5" />
			</span>
			<div class="min-w-0 flex-1">
				<div class="text-xs font-semibold tracking-wide uppercase {style.text}">{style.label}</div>
				<div class="truncate font-bold">{title}</div>
			</div>
			{#if !confirmSkip}
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmSkip = true)}>
					Skip tutorial
				</button>
			{/if}
		</header>

		<!-- Skipping is a decision, never a slip: it asks once -->
		{#if confirmSkip}
			<div class="mt-4 alert flex flex-wrap items-center gap-3" role="alertdialog">
				<div class="min-w-0 flex-1">
					<p class="font-semibold">Skip this tutorial?</p>
					<p class="text-sm text-base-content/70">
						You can start it again under PostPin Guides in the account menu.
					</p>
				</div>
				<button type="button" class="btn btn-ghost btn-sm" onclick={onskip}>Skip</button>
				<button
					type="button"
					class="btn btn-sm {style.button}"
					onclick={() => (confirmSkip = false)}
				>
					Continue tutorial
				</button>
			</div>
		{/if}

		<ol class="mt-6 flex gap-1.5" aria-label="Progress">
			{#each steps as label, i (label)}
				<li
					class="h-1.5 flex-1 rounded-full {i <= current ? style.dot : 'bg-base-300'}"
					title={label}
					aria-current={i === current ? "step" : undefined}
				>
					<span class="sr-only">{label}</span>
				</li>
			{/each}
		</ol>

		<section class="card mt-6 bg-base-100 shadow-xl">
			<div class="card-body gap-5 p-6 sm:p-10">
				{@render children()}
			</div>
		</section>
	</div>
</div>
