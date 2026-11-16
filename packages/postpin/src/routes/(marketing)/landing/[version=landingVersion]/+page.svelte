<script lang="ts">
	import type { PageProps } from "./$types";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import LandingClassic from "#lib/components/landing/LandingClassic.svelte";
	import LandingSlides from "#lib/components/landing/LandingSlides.svelte";

	// 1: the long scroll page, 2: slides with the icon timeline, 3: slides with the Lottie (as on /)
	let { params }: PageProps = $props();

	const names = { "1": "Classic", "2": "Icon timeline", "3": "Workflow animation" } as const;
</script>

<PageMeta title="Landing {params.version}: {names[params.version]}" />
<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key params.version}
	{#if params.version === "1"}
		<LandingClassic />
	{:else}
		<LandingSlides hero={params.version === "2" ? "timeline" : "lottie"} />
	{/if}
{/key}
