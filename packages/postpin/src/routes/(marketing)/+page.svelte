<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import LandingFlow from "#lib/components/landing/LandingFlow.svelte";
</script>

<PageMeta
	description="Video review for post-production. Upload a cut from your editing software, collect frame-accurate notes from your team and clients, and pull them into your timeline as markers."
/>
<svelte:head>
	<meta property="og:image" content="/landing/review-dark.webp" />
</svelte:head>

<LandingFlow />
