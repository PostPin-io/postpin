<script lang="ts">
	// The guide button: starts a tour right where its feature is, see docs/guides/README.md
	// (rule 4). Only while the tour isn't done or skipped, and only with guides switched on.
	// Put it next to the element the tour's first step highlights.
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import { page } from "$app/state";
	import { GUIDES, GUIDE_STYLE, type GuideId } from "#lib/guides.ts";
	import { guideState, isOpen, requestGuide } from "./guide-state.svelte.ts";
	import { getGuideAvailability, getGuideProgress, getGuidesEnabled } from "./guides.remote.ts";

	interface Props {
		guide: GuideId;
		class?: string;
	}
	let { guide, class: className = "" }: Props = $props();

	const title = $derived(GUIDES.find((g) => g.id === guide)?.title ?? "");
	// Signed-in pages only: guests have no progress to read
	const signedIn = $derived(!!page.route.id?.startsWith("/(root)/"));
	// .current, not await: a button must never hold up the header it sits in
	const progress = $derived(signedIn ? getGuideProgress().current : undefined);
	const enabled = $derived(guideState.enabled ?? (signedIn ? getGuidesEnabled().current : false));
	const availability = $derived(signedIn ? getGuideAvailability().current : undefined);

	const visible = $derived(
		enabled === true &&
			!!progress &&
			!!availability &&
			availability[guide] !== false &&
			isOpen(progress, guide) &&
			guideState.running === null,
	);
</script>

{#if visible}
	<button
		type="button"
		class="btn btn-circle shrink-0 btn-xs {GUIDE_STYLE.tour.button} {className}"
		title="Tour: {title}"
		aria-label="Start the tour: {title}"
		onclick={() => requestGuide(guide)}
	>
		<GraduationCap class="size-3.5" />
	</button>
{/if}
