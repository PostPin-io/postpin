<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import LandingFlow from "#lib/components/landing/LandingFlow.svelte";
</script>

<PageMeta
	description="Video review for post-production. Upload a cut from your editing software, collect frame-accurate notes from your team and clients, and pull them into your timeline as markers."
	image={{
		src: "/landing/social.jpg",
		width: 1200,
		height: 630,
		alt: "PostPin: from your timeline to your client and back",
	}}
	canonical
/>

<LandingFlow />
