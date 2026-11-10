<script lang="ts">
	import { page } from "$app/state";
	import { GUEST_NAME_MAX_LENGTH } from "@postpin-io/shared/logic/share-links";
	import ExportReview from "#lib/components/review/ExportReview.svelte";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import ShareLinkError from "#lib/components/share-view/ShareLinkError.svelte";
	import {
		getShareInfo,
		joinShare,
		recordShareView,
	} from "#lib/components/share-view/share-view.remote.ts";

	const token = $derived(page.params.token!);
	const infoQuery = $derived(getShareInfo(token));
	const info = $derived(infoQuery.current);
	const errorStatus = $derived((infoQuery.error as { status?: number } | undefined)?.status);

	let name = $state("");
	let joining = $state(false);
	let joinError = $state<string | null>(null);

	// Once per page load, as soon as the guest is known (also right after joining)
	let viewRecorded = false;
	$effect(() => {
		if (!info?.guest || viewRecorded) return;
		viewRecorded = true;
		recordShareView(token).catch(() => {
			// counting is best effort: the view works without it
		});
	});

	async function join(event: SubmitEvent) {
		event.preventDefault();
		joining = true;
		joinError = null;
		try {
			await joinShare({ token, name });
		} catch {
			joinError = "Please enter your name.";
		} finally {
			joining = false;
		}
	}
</script>

<PageMeta
	title={info?.exportName ?? "Shared export"}
	description="Watch this export and leave your markers."
/>

{#if infoQuery.error}
	<ShareLinkError status={errorStatus} />
{:else if !info}
	<div class="flex h-full items-center justify-center" role="status" aria-live="polite">
		<span class="loading loading-spinner"></span>
	</div>
{:else if !info.guest}
	<div class="flex min-h-full items-center justify-center bg-base-200 p-4">
		<form class="card w-full max-w-sm bg-base-100 shadow" onsubmit={join}>
			<div class="card-body gap-3">
				<h1 class="card-title">{info.exportName}</h1>
				<p class="text-sm text-base-content/70">
					Enter your name so the team knows who left which marker.
				</p>
				<input
					name="name"
					class="input w-full"
					placeholder="Your name"
					autocomplete="name"
					required
					maxlength={GUEST_NAME_MAX_LENGTH}
					disabled={joining}
					bind:value={name}
				/>
				{#if joinError}<p class="text-sm text-error">{joinError}</p>{/if}
				<button class="btn btn-primary" disabled={joining || !name.trim()}>
					Continue
					{#if joining}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			</div>
		</form>
	</div>
{:else}
	<!-- The team's export view, limited to what the link shows -->
	<ExportReview
		exportId={info.exportId}
		share={{
			token,
			exportName: info.exportName,
			guestName: info.guest.name,
			note: info.note,
			timelinePanelVisible: info.timelinePanelVisible,
			markerPanelVisible: info.markerPanelVisible,
		}}
	/>
{/if}
