<!--
	The first screen of /landing/4: the first screen of /landing/2 (big logo, name and slogan) with
	the start button added, 70% of the screen high. The animation is not here but left of the steps
	of "How it works" (PipelineRail), on every screen size.
-->
<script lang="ts">
	import Logo from "#lib/components/layout/Logo.svelte";

	interface Props {
		/** Whether the big logo is on screen; the navbar shows its own once it has scrolled out */
		logoInView?: boolean;
	}
	let { logoInView = $bindable(true) }: Props = $props();

	function watchLogo(node: HTMLElement) {
		// the sticky navbar covers the top of the screen, so the logo is gone once it is under it
		const observer = new IntersectionObserver(
			([entry]) => {
				logoInView = !!entry?.isIntersecting;
			},
			{ rootMargin: "-64px 0px 0px 0px" },
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
</script>

<section class="flex min-h-[70dvh] flex-col justify-center px-4 py-8 text-center">
	<div class="mx-auto flex max-w-5xl flex-col items-center">
		<div use:watchLogo>
			<Logo class="intro-logo h-[clamp(3rem,9dvh,6rem)] w-auto" />
		</div>
		<p class="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">PostPin</p>
		<h1 class="mt-4 max-w-3xl text-2xl text-balance text-base-content/80 sm:text-3xl">
			From your timeline to your client and back
		</h1>
		<p class="mx-auto mt-3 max-w-2xl text-lg text-pretty text-base-content/70">
			Upload a cut, collect notes from your team and clients, and pull them into your editor as
			markers.
		</p>
		<a href="/auth/signup" class="btn mt-5 btn-lg btn-primary">Start your review</a>
	</div>
</section>

<style>
	/* The logo builds itself on load: the bars grow one after another, then the pin drops in */
	:global(.intro-logo path) {
		transform-box: fill-box;
		transform-origin: bottom;
		animation: flow-bar-grow 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	:global(.intro-logo circle) {
		transform-box: fill-box;
		animation: flow-pin-drop 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) 0.75s both;
	}
	:global(.intro-logo path:nth-of-type(2)) {
		animation-delay: 0.06s;
	}
	:global(.intro-logo path:nth-of-type(3)) {
		animation-delay: 0.12s;
	}
	:global(.intro-logo path:nth-of-type(4)) {
		animation-delay: 0.18s;
	}
	:global(.intro-logo path:nth-of-type(5)) {
		animation-delay: 0.24s;
	}
	:global(.intro-logo path:nth-of-type(6)) {
		animation-delay: 0.3s;
	}
	:global(.intro-logo path:nth-of-type(7)) {
		animation-delay: 0.36s;
	}
	@keyframes flow-bar-grow {
		from {
			scale: 1 0;
		}
	}
	@keyframes flow-pin-drop {
		from {
			opacity: 0;
			translate: 0 -40%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.intro-logo path),
		:global(.intro-logo circle) {
			animation: none;
		}
	}
</style>
