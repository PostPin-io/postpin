<script lang="ts">
	import type { PageProps } from "./$types";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import LandingClassic from "#lib/components/landing/LandingClassic.svelte";
	import LandingSlides from "#lib/components/landing/LandingSlides.svelte";
	import LandingFlow from "#lib/components/landing/LandingFlow.svelte";

	// 1: the long scroll page, 2: slides with the icon timeline, 3: slides with the Lottie,
	// 4: the current landing page (as on /)
	let { params }: PageProps = $props();

	const names = {
		"1": "Classic",
		"2": "Icon timeline",
		"3": "Workflow animation",
		"4": "Flow (current)",
	} as const;
</script>

<PageMeta title="Landing {params.version}: {names[params.version]}" />
<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key params.version}
	{#if params.version === "1"}
		<LandingClassic />
	{:else if params.version === "4"}
		<LandingFlow />
	{:else}
		<LandingSlides hero={params.version === "2" ? "timeline" : "lottie"} />
	{/if}
{/key}
