<script lang="ts">
	// Decides which guide runs where, see docs/guides/README.md (rules 3–5): tutorials start on
	// their own, tours from their guide button, except the tour about the guides themselves.
	// One guide at a time, tutorials first. Switched off, only what was started by hand runs.
	import { afterNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import { authClient } from "#lib/auth-client.ts";
	import { GUIDES, type GuideId } from "#lib/guides.ts";
	import { roleAllows, toRole } from "#lib/roles.ts";
	import GuideFeedback from "./GuideFeedback.svelte";
	import Tour from "./Tour.svelte";
	import { endGuide, guideState, isOpen, statusOf, syncEnded } from "./guide-state.svelte.ts";
	import { getGuideProgress, getGuidesEnabled, saveGuideProgress } from "./guides.remote.ts";
	import type { TourDefinition } from "./tour.ts";
	import { postpinGuidesTour } from "./tours/postpin-guides.ts";
	import { shareLinkTour } from "./tours/share-link.ts";
	import FirstUploadTutorial from "./tutorials/FirstUploadTutorial.svelte";

	const TOURS: Partial<Record<GuideId, TourDefinition>> = {
		"postpin-guides": postpinGuidesTour,
		"share-link": shareLinkTour,
	};

	const progress = $derived(await getGuideProgress());
	const storedEnabled = $derived(await getGuidesEnabled());
	const enabled = $derived(guideState.enabled ?? storedEnabled);

	$effect(() => syncEnded(progress));
	$effect(() => {
		if (guideState.enabled === storedEnabled) guideState.enabled = null;
	});

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	const organizations = authClient.useListOrganizations();
	/** A fresh account: the tutorial starts with creating the organization */
	const noOrganization = $derived($organizations.data?.length === 0);

	const save =
		(guideId: GuideId) =>
		(status: GuideStatus, step?: string, context?: Record<string, string>) => {
			// done or skipped: gone at once, without waiting for the server
			if (status !== GuideStatus.STARTED) endGuide(guideId, status);
			return saveGuideProgress({ guideId, status, step, context });
		};

	// For those who can do what it teaches: an invited reviewer can't create projects. Once
	// running it stays, also while the new organization's membership is still loading.
	const firstUploadDue = $derived(
		isOpen(progress, "first-upload") &&
			(statusOf(progress, "first-upload") === GuideStatus.STARTED ||
				noOrganization ||
				(!!role && roleAllows(role, "project", "create"))),
	);
	const firstUpload = $derived(
		page.route.id === "/(root)/dashboard" &&
			((enabled && firstUploadDue) || guideState.requested === "first-upload"),
	);

	// The tour about guides comes after the tutorial: only once first-upload is completed or
	// skipped, or for someone who can't do it (in an organization without the right to create
	// projects). Not while memberships load: that would look like "nothing due".
	const firstUploadSettled = $derived.by(() => {
		const status = statusOf(progress, "first-upload");
		return status === GuideStatus.COMPLETED || status === GuideStatus.SKIPPED;
	});
	const cannotUpload = $derived(
		!!$organizations.data?.length && role !== null && !roleAllows(role, "project", "create"),
	);
	const postpinGuidesDue = $derived(
		enabled &&
			isOpen(progress, "postpin-guides") &&
			role !== null &&
			!firstUploadDue &&
			(firstUploadSettled || cannotUpload),
	);

	const tour = $derived.by((): GuideId | null => {
		if (firstUpload) return null;
		const requested = guideState.requested;
		if (requested && TOURS[requested]) return requested;
		return postpinGuidesDue ? "postpin-guides" : null;
	});

	$effect(() => {
		guideState.running = firstUpload ? "first-upload" : tour;
	});

	// A tour started from a guide button belongs to that page: leaving it pauses the tour
	afterNavigate(({ from, to }) => {
		const requested = guideState.requested;
		if (!requested || from?.url.pathname === to?.url.pathname) return;
		if (GUIDES.find((g) => g.id === requested)?.trigger === "manual") guideState.requested = null;
	});
</script>

{#if firstUpload}
	<FirstUploadTutorial
		progress={progress["first-upload"]}
		hasOrganization={!!$activeMember.data}
		save={save("first-upload")}
	/>
{/if}

{#if tour}
	{@const saveTour = save(tour)}
	{#key tour}
		<Tour
			tour={TOURS[tour]!}
			onstep={(step) => saveTour(GuideStatus.STARTED, step)}
			onfinish={() => saveTour(GuideStatus.COMPLETED)}
			onskip={() => saveTour(GuideStatus.SKIPPED)}
		/>
	{/key}
{/if}

<GuideFeedback />
