<script lang="ts">
	// The export's share links, at the right end of the header. Only on export pages.
	import { page } from "$app/state";
	import ShareArrow from "#lib/components/icons/ShareArrow.svelte";
	import SharingSetupModal from "#lib/components/sharing/SharingSetupModal.svelte";
	import { getShareLinks } from "#lib/components/sharing/share-links/share-links.remote.ts";
	import { getBreadcrumbNames } from "./breadcrumbs.remote.ts";

	let sharingModal = $state<SharingSetupModal | null>(null);

	const projectId = $derived(page.params.project);
	const timelineId = $derived(page.params.timeline);
	const exportId = $derived(page.params.export);

	// Awaited like in Breadcrumbs (same query, so cached): it changes together with the navigation
	const names = $derived(
		projectId && timelineId && exportId
			? await getBreadcrumbNames({ projectId, timelineId, exportId }).catch(loadFailed)
			: undefined,
	);
	const exp = $derived(names?.export?.canShare ? names.export : undefined);

	const shareLinks = $derived(exp ? await getShareLinks(exp.id).catch(loadFailed) : undefined);
	const count = $derived(shareLinks?.filter((link) => link.status === "active").length ?? 0);

	// A failed query must not take the page down with it: the button just stays hidden
	function loadFailed(error: unknown) {
		console.error("Could not load the share button", error);
		return undefined;
	}
</script>

{#if exp && projectId && timelineId}
	<button
		type="button"
		class="btn gap-1.5 btn-ghost {count ? '' : 'btn-square'}"
		title="Share links"
		aria-label={count ? `Share links (${count} active)` : "Share links"}
		onclick={() => sharingModal?.open({ projectId, timelineId, exportId: exp.id })}
	>
		<ShareArrow class="size-5" />
		{#if count}<span class="badge badge-sm badge-primary">{count}</span>{/if}
	</button>
	<SharingSetupModal bind:this={sharingModal} />
{/if}
