<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import LandingSlides from "#lib/components/landing/LandingSlides.svelte";
</script>

<PageMeta
	description="Video review for post-production. Upload a cut from your editing software, collect frame-accurate notes from your team and clients, and pull them into your timeline as markers."
/>
<svelte:head>
	<meta property="og:image" content="/landing/review-dark.webp" />
</svelte:head>

<LandingSlides />
