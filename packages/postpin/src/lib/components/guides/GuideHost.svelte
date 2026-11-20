<script lang="ts">
	// Decides which guide runs where, see docs/guides/README.md (rules 3–5): tutorials start on
	// their own, tours from their guide button, except the tour about the guides themselves.
	// One guide at a time, tutorials first. Switched off, only what was started by hand runs.
	import { afterNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import { MediaQuery } from "svelte/reactivity";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import { authClient } from "#lib/auth-client.ts";
	import { GUIDES, roleCanDo, type GuideId } from "#lib/guides.ts";
	import { toRole } from "#lib/roles.ts";
	import GuideFeedback from "./GuideFeedback.svelte";
	import Tour from "./Tour.svelte";
	import { endGuide, guideState, isOpen, statusOf, syncEnded } from "./guide-state.svelte.ts";
	import {
		getGuideAvailability,
		getGuideProgress,
		getGuidesEnabled,
		saveGuideProgress,
	} from "./guides.remote.ts";
	import type { TourDefinition } from "./tour.ts";
	import { markerRangesTour } from "./tours/marker-ranges.ts";
	import { navigationTour } from "./tours/navigation.ts";
	import { postpinGuidesTour } from "./tours/postpin-guides.ts";
	import { shareLinkTour } from "./tours/share-link.ts";
	import FirstUploadTutorial from "./tutorials/FirstUploadTutorial.svelte";
	import InstallDesktopTutorial from "./tutorials/InstallDesktopTutorial.svelte";
	import InstallPremiereTutorial from "./tutorials/InstallPremiereTutorial.svelte";
	import InstallResolveTutorial from "./tutorials/InstallResolveTutorial.svelte";
	import { firstReviewTour } from "./tutorials/first-review.ts";

	const TOURS: Partial<Record<GuideId, TourDefinition>> = {
		"postpin-guides": postpinGuidesTour,
		navigation: navigationTour,
		"share-link": shareLinkTour,
		"marker-ranges": markerRangesTour,
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
	/** Only what the user's role can do at all runs, also when started by hand (rule 17) */
	const roleAllowsGuide = (id: GuideId) =>
		roleCanDo(
			GUIDES.find((g) => g.id === id)!,
			role,
		);
	const requested = $derived(
		guideState.requested && roleAllowsGuide(guideState.requested) ? guideState.requested : null,
	);

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
				(!!role && roleAllowsGuide("first-upload"))),
	);
	// Another tutorial started by hand goes first: it was asked for right now
	const otherTutorialRequested = $derived(
		!!requested &&
			requested !== "first-upload" &&
			GUIDES.find((g) => g.id === requested)?.type === "tutorial",
	);
	const firstUpload = $derived(
		page.route.id === "/(root)/dashboard" &&
			((enabled && firstUploadDue && !otherTutorialRequested) || requested === "first-upload"),
	);

	const INSTALL_TUTORIALS = {
		"install-resolve": InstallResolveTutorial,
		"install-premiere": InstallPremiereTutorial,
		"install-desktop": InstallDesktopTutorial,
	} as const;
	type InstallId = keyof typeof INSTALL_TUTORIALS;
	const INSTALL_IDS = Object.keys(INSTALL_TUTORIALS) as InstallId[];

	// Started by hand (for now only from the PostPin Guides page, later from plugin-workflow), it
	// runs where it was started; one in progress goes on on the dashboard. Never over the sign-in
	// pages: the device approval it waits for may happen in this very tab.
	const install = $derived.by((): InstallId | null => {
		if (firstUpload || page.route.id?.startsWith("/auth")) return null;
		const byHand = INSTALL_IDS.find((id) => id === requested);
		if (byHand) return byHand;
		if (!enabled || page.route.id !== "/(root)/dashboard") return null;
		return INSTALL_IDS.find((id) => statusOf(progress, id) === GuideStatus.STARTED) ?? null;
	});

	// The tour about guides comes after the tutorial: only once first-upload is completed or
	// skipped, or for someone who can't do it (in an organization without the right to create
	// projects). Not while memberships load: that would look like "nothing due".
	const firstUploadSettled = $derived.by(() => {
		const status = statusOf(progress, "first-upload");
		return status === GuideStatus.COMPLETED || status === GuideStatus.SKIPPED;
	});
	const cannotUpload = $derived(
		!!$organizations.data?.length && role !== null && !roleAllowsGuide("first-upload"),
	);
	const postpinGuidesDue = $derived(
		enabled &&
			isOpen(progress, "postpin-guides") &&
			role !== null &&
			!firstUploadDue &&
			(firstUploadSettled || cannotUpload),
	);

	// On the review page itself, through the tour engine. Desktop only for now: on phones the
	// marker editor and the replies are in a modal of their own. A guide started by hand goes
	// first (e.g. the share links tour started from the PostPin Guides page on this very export).
	const reviewPage = $derived(
		page.route.id === "/(root)/projects/[project]/timelines/[timeline]/exports/[export]",
	);
	const wide = new MediaQuery("min-width: 1024px");
	const firstReview = $derived.by(() => {
		if (firstUpload || install || !reviewPage || !wide.current) return false;
		if (requested === "first-review") return true;
		return (
			enabled &&
			!guideState.requested &&
			isOpen(progress, "first-review") &&
			!!role &&
			roleAllowsGuide("first-review")
		);
	});

	const tour = $derived.by((): GuideId | null => {
		if (firstUpload || install || firstReview) return null;
		if (requested && TOURS[requested]) {
			return TOURS[requested].desktopOnly && !wide.current ? null : requested;
		}
		return postpinGuidesDue ? "postpin-guides" : null;
	});

	$effect(() => {
		guideState.running = firstUpload
			? "first-upload"
			: (install ?? (firstReview ? "first-review" : tour));
	});

	afterNavigate(({ from, to }) => {
		// a first export may have come in on the way: guide buttons waiting for one can show
		const availability = getGuideAvailability();
		if (availability.current && Object.values(availability.current).includes(false)) {
			void availability.refresh();
		}
		// A tour started from a guide button belongs to that page: leaving it pauses the tour,
		// unless its way leads through several pages
		const requested = guideState.requested;
		if (!requested || from?.url.pathname === to?.url.pathname) return;
		if (TOURS[requested]?.spansPages) return;
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

{#if install}
	{@const InstallGuide = INSTALL_TUTORIALS[install]}
	{#key install}
		<InstallGuide progress={progress[install]} save={save(install)} />
	{/key}
{/if}

{#if firstReview}
	{@const saveReview = save("first-review")}
	<Tour
		tour={firstReviewTour}
		onstep={(step) => saveReview(GuideStatus.STARTED, step)}
		onfinish={() => saveReview(GuideStatus.COMPLETED)}
		onskip={() => saveReview(GuideStatus.SKIPPED)}
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
