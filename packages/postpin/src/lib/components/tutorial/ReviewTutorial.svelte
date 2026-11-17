<script lang="ts">
	// Part 2 of the tutorial, on the review page of an export of the tutorial's project. The marker
	// tour starts on its own; the sharing tour waits behind the Share Guide button next to the breadcrumbs.
	import { onDestroy, type Component } from "svelte";
	import DiamondPlus from "@lucide/svelte/icons/diamond-plus";
	import Locate from "@lucide/svelte/icons/locate";
	import PointerIcon from "../review/markers/PointerIcon.svelte";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import { commandKeyLabel, isApplePlatform } from "#lib/keyboard.ts";
	import { DOC_LINKS } from "./doc-links.ts";
	import { reviewTour } from "./review-tour.svelte.ts";
	import ShareTour from "./ShareTour.svelte";
	import TutorialCard from "./TutorialCard.svelte";
	import { finishTutorial, getTutorialState, markTutorialStep } from "./tutorial.remote.ts";

	interface Props {
		projectId: string;
		timelineId: string;
		exportId: string;
		/** This page's export, as its breadcrumb says */
		exportName: string;
		/** The export can be played: before that there is nothing to explain */
		ready: boolean;
		/** Opens the sharing dialog for the export, or for its timeline (where the invite links are) */
		onshare: (target: { projectId: string; timelineId: string; exportId?: string }) => void;
	}
	let { projectId, timelineId, exportId, exportName, ready, onshare }: Props = $props();

	const tutorial = $derived(await getTutorialState());
	const active = $derived(
		ready && tutorial.step === "review" && tutorial.project?.id === projectId,
	);
	const showMarkers = $derived(active && !tutorial.seen.markers);
	const offerSharing = $derived(active && !tutorial.seen.sharing);

	let markerPage = $state(0);
	const cmd = commandKeyLabel();

	// Opened straight from the plugin, the export is still being processed and the tutorial is at
	// "upload". Nothing tells this page when that changes: ask until the export counts as uploaded.
	$effect(() => {
		if (!ready || tutorial.step !== "upload" || tutorial.project?.id !== projectId) return;
		void getTutorialState().refresh();
		const timer = setInterval(() => void getTutorialState().refresh(), 3000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		reviewTour.shareOffered = offerSharing;
	});
	onDestroy(() => {
		reviewTour.shareOffered = false;
		reviewTour.shareOpen = false;
		reviewTour.hint = null;
	});

	async function skip() {
		await finishTutorial();
		await getTutorialState().refresh();
	}

	async function seen(step: "markers" | "sharing") {
		await markTutorialStep(step);
		await getTutorialState().refresh();
	}

	// the tour ends where its last page sends the user: they have read all of it
	function openSharing(hint: "share-link" | "invite-link") {
		void seen("sharing");
		reviewTour.hint = hint;
		onshare(
			hint === "share-link" ? { projectId, timelineId, exportId } : { projectId, timelineId },
		);
	}
</script>

<!-- An icon within a sentence, as it looks on its button -->
{#snippet inline(Icon: Component<{ class?: string }>)}
	<Icon class="inline size-4 align-text-bottom text-base-content" />
{/snippet}

{#if showMarkers && markerPage === 0}
	<TutorialCard title="Markers" icon={DiamondPlus} progress="1 of 4" onskip={skip}>
		<p>
			{@render inline(DiamondPlus)} or <kbd class="kbd kbd-sm">M</kbd> adds a marker at the playhead.
		</p>
		<p>
			Cut, copy and paste markers with <kbd class="kbd kbd-sm">{cmd}X</kbd>
			<kbd class="kbd kbd-sm">{cmd}C</kbd>
			<kbd class="kbd kbd-sm">{cmd}V</kbd>.
		</p>
		{#snippet actions()}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => (markerPage = 1)}>
				Next
			</button>
		{/snippet}
	</TutorialCard>
{:else if showMarkers && markerPage === 1}
	<TutorialCard title="Open and jump" icon={Locate} progress="2 of 4" onskip={skip}>
		<p>Double-click a marker to open or close it.</p>
		<p>
			Jump to it with {@render inline(Locate)} or
			<kbd class="kbd kbd-sm">{isApplePlatform() ? "⌥" : "Alt"}</kbd> + click.
		</p>
		<p>
			In an open marker, {@render inline(PointerIcon)} or <kbd class="kbd kbd-sm">P</kbd> points at something
			in the picture.
		</p>
		{#snippet actions()}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => (markerPage = 2)}>
				Next
			</button>
		{/snippet}
	</TutorialCard>
{:else if showMarkers && markerPage === 2}
	<TutorialCard title="Sync with your plugin" icon={RefreshCw} progress="3 of 4" onskip={skip}>
		<p>Both buttons are in the PostPin plugin of your editing software.</p>
		<p>
			<strong>Push markers ↑</strong> uploads the markers of your timeline.
		</p>
		<p>
			<strong>↓ Pull comments</strong> downloads the notes onto your timeline.
		</p>
		<p>
			<a class="link" href={DOC_LINKS.markerSync} target="_blank" rel="noopener noreferrer">
				Detailed guide
			</a>
		</p>
		{#snippet actions()}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => (markerPage = 3)}>
				Next
			</button>
		{/snippet}
	</TutorialCard>
{:else if showMarkers}
	<TutorialCard title="That's it!" progress="4 of 4" onskip={skip}>
		<p>Upload, collect notes, pull them into your timeline.</p>
		{#if offerSharing}
			<p>
				Ready to send your export? Open the {@render inline(GraduationCap)}
				<strong>Share Guide</strong> next to the names at the top of the page.
			</p>
		{/if}
		{#snippet actions()}
			<button type="button" class="btn btn-primary btn-sm" onclick={() => seen("markers")}>
				Done
			</button>
		{/snippet}
	</TutorialCard>
{/if}

{#if offerSharing}
	<ShareTour
		names={{
			project: tutorial.project?.name ?? "Project",
			timeline: tutorial.timeline?.id === timelineId ? tutorial.timeline.name : "Timeline",
			export: exportName,
		}}
		ondone={() => seen("sharing")}
		onsharelink={() => openSharing("share-link")}
		oninvitelink={() => openSharing("invite-link")}
	/>
{/if}
