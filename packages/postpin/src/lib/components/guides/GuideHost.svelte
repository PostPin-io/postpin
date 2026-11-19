<script lang="ts">
	// Decides which guide runs where, see docs/guides/README.md. A guide that was never started
	// (or not finished) starts on its own; finished or skipped ones only via PostPin Guides.
	import { page } from "$app/state";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import { authClient } from "#lib/auth-client.ts";
	import type { GuideId } from "#lib/guides.ts";
	import { roleAllows, toRole } from "#lib/roles.ts";
	import GuideFeedback from "./GuideFeedback.svelte";
	import { getGuideProgress, saveGuideProgress } from "./guides.remote.ts";
	import FirstUploadTutorial from "./tutorials/FirstUploadTutorial.svelte";

	const progress = $derived(await getGuideProgress());

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));

	// Done or skipped: gone at once, without waiting for the server (nothing may stay behind)
	let ended = $state<Partial<Record<GuideId, GuideStatus>>>({});
	// Once the server agrees, its word counts again, so a restart in PostPin Guides works
	$effect(() => {
		for (const [id, status] of Object.entries(ended) as [GuideId, GuideStatus][]) {
			if (progress[id]?.status === status) delete ended[id];
		}
	});

	const statusOf = (id: GuideId) => ended[id] ?? progress[id]?.status;
	const pending = (id: GuideId) => {
		const status = statusOf(id);
		return status === undefined || status === GuideStatus.STARTED;
	};

	const save =
		(guideId: GuideId) =>
		(status: GuideStatus, step?: string, context?: Record<string, string>) => {
			if (status !== GuideStatus.STARTED) ended[guideId] = status;
			return saveGuideProgress({ guideId, status, step, context });
		};

	const organizations = authClient.useListOrganizations();
	/** A fresh account: the tutorial starts with creating the organization */
	const noOrganization = $derived($organizations.data?.length === 0);

	// Only for those who can do what it teaches: an invited reviewer can't create projects.
	// Once running it stays, also while the new organization's membership is still loading.
	const firstUpload = $derived(
		page.route.id === "/(root)/dashboard" &&
			pending("first-upload") &&
			(statusOf("first-upload") === GuideStatus.STARTED ||
				noOrganization ||
				(!!role && roleAllows(role, "project", "create"))),
	);
</script>

{#if firstUpload}
	<FirstUploadTutorial
		progress={progress["first-upload"]}
		hasOrganization={!!$activeMember.data}
		save={save("first-upload")}
	/>
{/if}

<GuideFeedback />
