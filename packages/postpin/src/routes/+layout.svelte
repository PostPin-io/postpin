<script lang="ts">
	import type { LayoutProps } from "./$types";

	import "./layout.css";
	import UploadIndicator from "#lib/components/exports/UploadIndicator.svelte";
	import HeldUploadPopover from "#lib/components/exports/HeldUploadPopover.svelte";
	import { initTheme } from "#lib/theme.svelte.ts";
	import { page } from "$app/state";
	import GuideHost from "#lib/components/guides/GuideHost.svelte";
	import { resetGuideState } from "#lib/components/guides/guide-state.svelte.ts";
	import {
		getGuideAvailability,
		getGuideProgress,
		getGuidesEnabled,
	} from "#lib/components/guides/guides.remote.ts";
	import { authClient } from "#lib/auth-client.ts";

	let { children }: LayoutProps = $props();

	initTheme();

	// The guides' queries are cached per tab, not per user: after signing in as someone else
	// (without a reload) they'd still answer for the last user. So they are fetched again for
	// every user, and the guides only decide once that is done.
	const session = authClient.useSession();
	const userId = $derived($session.data?.user.id ?? null);
	let guidesReadyFor = $state<string | null>(null);
	$effect(() => {
		const id = userId;
		if (!id || id === guidesReadyFor) return;
		resetGuideState();
		void Promise.allSettled([
			getGuideProgress().refresh(),
			getGuidesEnabled().refresh(),
			getGuideAvailability().refresh(),
		]).then(() => {
			if (userId === id) guidesReadyFor = id;
		});
	});
</script>

<div class="h-full">
	{@render children()}
</div>
<!-- Here, not in (root)'s layout: the review page (+page@) leaves that one out. Signed-in pages
     only, and on its own boundary: a guide must never hold up or break the page. -->
{#if page.route.id?.startsWith("/(root)/") && userId && guidesReadyFor === userId}
	{#key userId}
		<svelte:boundary>
			<GuideHost />
			{#snippet pending()}{/snippet}
			{#snippet failed()}{/snippet}
		</svelte:boundary>
	{/key}
{/if}
<UploadIndicator />
<HeldUploadPopover />
