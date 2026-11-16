<script lang="ts">
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<!--
	The page scrolls inside this element, like the app, so the sticky navbar stays on top. On
	screens big enough for a whole slide it snaps from slide to slide (see .slide in the page);
	on phones it scrolls freely, because slides taller than the screen would get stuck.
-->
<div class="landing-scroller h-full snap-y snap-proximity overflow-y-auto scroll-smooth">
	{@render children()}
</div>

<style>
	.landing-scroller {
		/* height of LandingNav, which floats over the slides; they leave room for it */
		--nav-height: 5rem;
	}
	@media (min-width: 768px) and (min-height: 640px) {
		.landing-scroller {
			scroll-snap-type: y mandatory;
		}
	}
</style>
