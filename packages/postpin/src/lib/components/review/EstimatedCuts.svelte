<script lang="ts">
	// Web uploads have no timeline from an editing software: say so, and let the team pick how
	// sensitive the cut detection splits the video into shots
	import Scissors from "@lucide/svelte/icons/scissors";
	import { CUT_LEVEL_LABELS, type CutLevel } from "@postpin-io/shared/logic/web-upload";
	import { setCutSensitivity } from "./cuts.remote.ts";

	interface Props {
		exportId: string;
		cutLevel: CutLevel;
		/** The cut detection ran, so its scores can be cut at another level */
		detected: boolean;
		canChange: boolean;
		/** Called after the shots changed; their thumbnails follow a moment later */
		onchanged: () => void | Promise<void>;
	}
	let { exportId, cutLevel, detected, canChange, onchanged }: Props = $props();

	const LEVELS = ["sensitive", "medium", "insensitive", "none"] as const;
	let saving = $state<CutLevel | null>(null);
	let error = $state<string | null>(null);

	async function choose(level: CutLevel) {
		if (level === cutLevel || saving) return;
		saving = level;
		error = null;
		try {
			await setCutSensitivity({ exportId, level });
			await onchanged();
		} catch (e) {
			error = (e as { body?: { message?: string } })?.body?.message ?? "Could not change the cuts";
		} finally {
			saving = null;
		}
	}
</script>

<details class="dropdown dropdown-end dropdown-top">
	<summary
		class="btn gap-1 btn-ghost btn-xs"
		title="The timeline and its cuts are estimated from the video"
	>
		<Scissors size={14} />
		<span class="max-sm:hidden"></span>
	</summary>
	<div class="dropdown-content z-20 mb-2 w-72 rounded-box bg-base-100 p-3 text-sm shadow-lg">
		<p class="font-semibold">Estimated timeline</p>
		<p class="mt-1 text-base-content/70">
			This video was uploaded in the browser. Its shots were detected from the picture, not taken
			from an editing software, so a cut may be missing or one too many.
		</p>
		{#if canChange}
			<p class="mt-3 mb-1 text-xs font-medium tracking-wide text-base-content/60 uppercase">Cuts</p>
			<div class="join w-full" role="radiogroup" aria-label="Cut sensitivity">
				{#each LEVELS as level (level)}
					<button
						type="button"
						role="radio"
						aria-checked={level === cutLevel}
						class="btn join-item flex-1 px-1 btn-xs"
						class:btn-active={level === cutLevel}
						disabled={!!saving || (!detected && level !== "none")}
						onclick={() => void choose(level)}
					>
						{#if saving === level}<span class="loading loading-xs loading-spinner"></span>{/if}
						{CUT_LEVEL_LABELS[level]}
					</button>
				{/each}
			</div>
			{#if !detected}
				<p class="mt-2 text-xs text-base-content/60">
					Cut detection was turned off for this upload.
				</p>
			{/if}
		{/if}
		{#if error}
			<p class="mt-2 text-xs text-error" role="alert">{error}</p>
		{/if}
	</div>
</details>
