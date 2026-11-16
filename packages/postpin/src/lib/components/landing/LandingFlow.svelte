<!--
	The landing page (/, and /landing/4 to compare it with the earlier versions): the long scroll
	page of /landing/1 with the logo of /landing/2 as its first screen and the animation standing
	left of the steps of "How it works".
-->
<script lang="ts">
	import LandingClassic from "#lib/components/landing/LandingClassic.svelte";
	import FlowHero from "#lib/components/landing/FlowHero.svelte";
	import PipelineRail from "#lib/components/landing/PipelineRail.svelte";

	// whether the big logo of the first screen is on screen; the navbar shows its brand after
	let logoInView = $state(true);
</script>

<LandingClassic wideNav brandHidden={logoInView}>
	{#snippet hero()}
		<FlowHero bind:logoInView />
	{/snippet}
	{#snippet rail()}
		<PipelineRail />
	{/snippet}
</LandingClassic>
