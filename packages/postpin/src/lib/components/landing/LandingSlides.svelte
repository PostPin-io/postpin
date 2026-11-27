<script lang="ts">
	import Logo from "#lib/components/layout/Logo.svelte";
	import LegalLinks from "#lib/components/layout/LegalLinks.svelte";
	import LandingNav from "#lib/components/landing/LandingNav.svelte";
	import Shot from "#lib/components/landing/Shot.svelte";
	import WorkflowAnimation from "#lib/components/landing/WorkflowAnimation.svelte";
	import PipelineTimeline from "#lib/components/landing/PipelineTimeline.svelte";

	interface Props {
		/**
		 * The first slide. "lottie": headline over the workflow animation with its steps
		 * (/landing/3). "timeline": the earlier one with the big logo over the icon timeline
		 * (/landing/2). The slides after it are the same.
		 */
		hero?: "lottie" | "timeline";
	}
	let { hero = "lottie" }: Props = $props();
	import Projector from "@lucide/svelte/icons/projector";
	import LayoutGrid from "@lucide/svelte/icons/layout-grid";
	import ChartGantt from "@lucide/svelte/icons/chart-gantt";
	import Tags from "@lucide/svelte/icons/tags";
	import Layers from "@lucide/svelte/icons/layers";
	import Smartphone from "@lucide/svelte/icons/smartphone";
	import Upload from "@lucide/svelte/icons/upload";
	import Check from "@lucide/svelte/icons/check";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";

	const DOCS = "https://docs.postpin.io";
	const GITHUB = "https://github.com/PostPin-io/postpin";

	const steps = [
		{
			id: "how-it-works",
			title: "Upload with one click",
			text: "One click in your editor sends the cut to PostPin, together with its timeline.",
			shot: {
				name: "resolve-main",
				alt: "PostPin in DaVinci Resolve with the Render & Upload button",
				width: 1400,
				height: 713,
			},
		},
		{
			id: "team",
			title: "Review with your team",
			text: "Your team adds notes on the exact frame and talks them through in replies.",
			shot: {
				name: "review-marker",
				alt: "Adding a note on the review page",
				width: 1600,
				height: 1000,
				themed: true,
			},
		},
		{
			id: "clients",
			title: "Get feedback from your client",
			text: "Send a link. Your client adds notes without an account and only sees their own.",
			shot: {
				name: "share-view",
				alt: "A client adding notes through a share link",
				width: 1600,
				height: 1000,
				themed: true,
			},
		},
		{
			id: "pull",
			title: "Bring the notes back",
			text: "Pull the notes into your timeline as markers, work through them and upload the next version.",
			shot: {
				name: "desktop-main",
				alt: "PostPin connected to Pro Tools, with Pull comments",
				width: 1400,
				height: 713,
			},
		},
	];

	const features = [
		{
			icon: Projector,
			title: "Screening mode",
			text: "Show a cut on a projector. The room adds notes from their phones.",
		},
		{
			icon: LayoutGrid,
			title: "Shot grid",
			text: "Every shot as a thumbnail, one click to jump there.",
		},
		{
			icon: ChartGantt,
			title: "Your timeline",
			text: "Tracks and clips from your editor, right under the player.",
		},
		{
			icon: Tags,
			title: "Categories",
			text: "Notes by department, in the marker colors of your editor.",
		},
		{
			icon: Layers,
			title: "Versions",
			text: "Every upload is a new version. Open notes come along.",
		},
		{
			icon: Smartphone,
			title: "Phone and tablet",
			text: "Review anywhere, in up to 4K.",
		},
	];

	const editors = [
		{ name: "DaVinci Resolve Studio", icon: "davinci-resolve", docs: "/plugins/resolve" },
		{ name: "Adobe Premiere Pro", icon: "premiere-pro", docs: "/plugins/premiere" },
		{ name: "Avid Pro Tools", icon: "pro-tools", docs: "/plugins/desktop" },
		{ name: "FilmCraft", icon: "filmcraft", docs: "/plugins/filmcraft" },
	];

	const slides = [
		{ id: "top", label: "PostPin" },
		...steps.map((step) => ({ id: step.id, label: step.title })),
		{ id: "features", label: "Features" },
		{ id: "editors", label: "Supported editors" },
		{ id: "hosting", label: "Cloud or self-hosted" },
	];

	// The phases of the animation on the first slide (markers in its Lottie file)
	const phases = [
		{ id: "upload", label: "Upload from your editor" },
		{ id: "review", label: "Review with your team and clients" },
		{ id: "back", label: "Notes back as markers" },
	];
	let phase = $state("upload");
	const phaseIndex = $derived(phases.findIndex((p) => p.id === phase));

	// The slide in the middle of the screen, for the dots on the right
	let current = $state("top");
	function trackSlide(node: HTMLElement) {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) current = node.id;
			},
			{ rootMargin: "-50% 0px -50% 0px" },
		);
		observer.observe(node);

		// Fades the slide's content in when it scrolls into view. Slides already on screen stay as
		// rendered, so nothing flashes, and without JavaScript everything is visible anyway.
		let reveal: IntersectionObserver | undefined;
		const rect = node.getBoundingClientRect();
		const onScreen = rect.top < innerHeight && rect.bottom > 0;
		if (!onScreen && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
			node.dataset.reveal = "hidden";
			reveal = new IntersectionObserver(
				([entry]) => {
					if (!entry?.isIntersecting) return;
					node.dataset.reveal = "shown";
					reveal?.disconnect();
				},
				{ threshold: 0.25 },
			);
			reveal.observe(node);
		}
		return {
			destroy: () => {
				observer.disconnect();
				reveal?.disconnect();
			},
		};
	}
</script>

{#snippet bullets(points: string[])}
	<ul class="space-y-2">
		{#each points as point (point)}
			<li class="flex gap-3">
				<Check class="mt-0.5 size-5 shrink-0 text-success" />
				<span>{point}</span>
			</li>
		{/each}
	</ul>
{/snippet}

<!-- the earlier version shows the brand in the navbar on the first slide too -->
<LandingNav floating minimal={hero === "lottie" && current === "top"} />

<nav aria-label="Slides" class="fixed top-1/2 right-4 z-40 hidden -translate-y-1/2 lg:block">
	<ul class="flex flex-col gap-3">
		{#each slides as slide (slide.id)}
			<li>
				<a
					href="#{slide.id}"
					class="tooltip tooltip-left block size-2.5 rounded-full transition-colors {current ===
					slide.id
						? 'bg-primary'
						: 'bg-base-content/20 hover:bg-base-content/40'}"
					data-tip={slide.label}
					aria-label={slide.label}
					aria-current={current === slide.id ? "true" : undefined}
				></a>
			</li>
		{/each}
	</ul>
</nav>

<main>
	{#if hero === "lottie"}
		<!-- 1: who we are and what it is, nothing else -->
		<!--
		Shorter than the others, so the top of the next slide shows: there is more below.
		The navbar has no logo here, the slide shows it big instead.
	-->
		<section
			id="top"
			use:trackSlide
			class="slide relative hero flex-col justify-center gap-8 text-center"
		>
			<!-- the message: one headline, the brand only as a small label above it -->
			<div class="mx-auto max-w-4xl">
				<div class="flex items-center justify-center gap-2 text-lg font-semibold">
					<Logo class="intro-logo h-7 w-auto" />
					PostPin
				</div>
				<h1 class="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
					From your timeline to your client and back
				</h1>
				<p class="mx-auto mt-3 max-w-2xl text-lg text-pretty text-base-content/70">
					Upload a cut, collect notes from your team and clients, and pull them into your editor as
					markers.
				</p>
				<div class="mt-6 flex flex-wrap justify-center gap-2">
					<a href="/auth/signup" class="btn btn-primary sm:btn-lg">Create an account</a>
					<a href="#how-it-works" class="btn sm:btn-lg">How it works</a>
				</div>
			</div>
			<!--
			the demo: animation and its steps on one surface, so they read as one thing; never taller
			than the screen allows
		-->
			<div
				class="mx-auto w-full max-w-[min(80rem,calc((88dvh-31rem)*16/5+3rem))] rounded-3xl bg-base-200 px-4 pt-4 pb-3 sm:px-6 sm:pt-6"
			>
				<WorkflowAnimation onphase={(next) => (phase = next)} />
				<ul class="steps mx-auto mt-1 w-full max-w-3xl text-xs sm:text-sm">
					{#each phases as step, i (step.id)}
						<li
							class="step transition-colors duration-500 {i <= phaseIndex
								? 'step-primary'
								: 'text-base-content/50'}"
						>
							{#if step.id === "upload"}
								<a href="#editors" class="flex items-center gap-1.5" title="Supported editors">
									Upload from
									{#each editors as editor (editor.name)}
										<img
											src="/landing/{editor.icon}.png"
											alt={editor.name}
											title={editor.name}
											width="18"
											height="18"
											class="size-4.5"
										/>
									{/each}
								</a>
							{:else}
								{step.label}
							{/if}
						</li>
					{/each}
				</ul>
			</div>
			<a
				href="#how-it-works"
				class="scroll-hint btn absolute bottom-2 left-1/2 btn-circle -translate-x-1/2 btn-ghost {current ===
				'top'
					? 'opacity-100'
					: 'pointer-events-none opacity-0'}"
				aria-label="Scroll to how it works"
			>
				<ChevronDown class="size-6" />
			</a>
		</section>
	{:else}
		<!-- 1, earlier version: the big logo and name, the icon timeline under the slogan -->
		<section id="top" use:trackSlide class="slide flex-col text-center">
			<div class="my-auto flex w-full flex-col items-center">
				<Logo class="intro-logo mx-auto h-20 w-auto sm:h-28" />
				<p class="mt-6 text-5xl font-bold tracking-tight sm:text-7xl">PostPin</p>
				<h1 class="mt-6 max-w-3xl text-2xl text-balance text-base-content/80 sm:text-3xl">
					From your timeline to your client and back
				</h1>
				<p class="mx-auto mt-4 max-w-2xl text-lg text-pretty text-base-content/70">
					Upload a cut, collect notes from your team and clients, and pull them into your editor as
					markers.
				</p>
				<!-- the workflow at a glance, right under the slogan, wider than the text -->
				<PipelineTimeline class="mt-10 hidden w-full max-w-5xl shrink-0 sm:block" />
				<!-- on phones a closer view that follows the dot from station to station -->
				<PipelineTimeline follow class="mt-8 w-full max-w-md shrink-0 sm:hidden" />
				<p class="mt-8 text-sm text-base-content/60">
					Free while in early access · Cloud or self-hosted · Open source
				</p>
			</div>
		</section>
	{/if}

	<!-- 2-5: one step per slide -->
	{#each steps as step, i (step.id)}
		<section id={step.id} use:trackSlide class="slide {i % 2 ? '' : 'bg-base-200'}">
			<div class="mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-5 lg:gap-12">
				<div class="lg:col-span-2">
					<p class="text-sm font-medium text-base-content/60">Step {i + 1} of {steps.length}</p>
					<h2 class="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-5xl">
						{step.title}
					</h2>
					<p class="mt-4 text-lg text-pretty text-base-content/70">{step.text}</p>
				</div>
				<div class="lg:col-span-3">
					<Shot {...step.shot} eager={i === 0} />
				</div>
			</div>
		</section>
	{/each}

	<!-- 6: features -->
	<section id="features" use:trackSlide class="slide">
		<div class="mx-auto w-full max-w-5xl">
			<h2 class="text-center text-3xl font-bold tracking-tight sm:text-5xl">
				Made for post-production
			</h2>
			<div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature (feature.title)}
					<article class="card-lift card border border-base-300 bg-base-100">
						<div class="card-body">
							<feature.icon class="size-7 text-primary" />
							<h3 class="card-title">{feature.title}</h3>
							<p class="text-base-content/70">{feature.text}</p>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<!-- 7: supported editors -->
	<section id="editors" use:trackSlide class="slide bg-base-200">
		<div class="mx-auto w-full max-w-4xl text-center">
			<h2 class="text-3xl font-bold tracking-tight sm:text-5xl">Works with your editor</h2>
			<p class="mt-4 text-lg text-base-content/70">On macOS and Windows.</p>
			<div class="mt-12 grid gap-4 text-left sm:grid-cols-2">
				{#each editors as editor (editor.name)}
					<a
						href="{DOCS}{editor.docs}"
						class="card-lift card border border-base-300 bg-base-100 hover:border-primary"
					>
						<div class="card-body flex-row items-center gap-4">
							<img
								src="/landing/{editor.icon}.png"
								alt=""
								width="48"
								height="48"
								loading="lazy"
								class="size-12 shrink-0"
							/>
							<h3 class="font-semibold">{editor.name}</h3>
						</div>
					</a>
				{/each}
				<a
					href="{DOCS}/guide/projects#upload-from-the-browser"
					class="card-lift card border border-dashed border-base-300 bg-base-100 hover:border-primary sm:col-span-2"
				>
					<div class="card-body flex-row items-center gap-4">
						<span class="grid size-12 shrink-0 place-items-center rounded-box bg-base-200">
							<Upload class="size-6" />
						</span>
						<div>
							<h3 class="font-semibold">Any other software</h3>
							<p class="text-sm text-base-content/70">Upload the video in the browser.</p>
						</div>
					</div>
				</a>
			</div>
			<a href="{DOCS}/downloads" class="btn mt-8">Downloads</a>
		</div>
	</section>

	<!-- 8: hosting, with the footer at the bottom of the last slide -->
	<section id="hosting" use:trackSlide class="slide flex-col pb-0!">
		<div class="mx-auto my-auto w-full max-w-4xl">
			<h2 class="text-center text-3xl font-bold tracking-tight sm:text-5xl">
				Cloud or self-hosted
			</h2>
			<div class="mt-12 grid gap-4 md:grid-cols-2">
				<article class="card-lift card border border-base-300 bg-base-100">
					<div class="card-body gap-5">
						<h3 class="card-title text-2xl">Cloud</h3>
						{@render bullets([
							"Free while in early access",
							"Servers in the EU",
							"Nothing to install or maintain",
						])}
						<div class="mt-auto card-actions">
							<a href="/auth/signup" class="btn btn-primary">Create an account</a>
						</div>
					</div>
				</article>
				<article class="card-lift card border border-base-300 bg-base-100">
					<div class="card-body gap-5">
						<h3 class="card-title text-2xl">Self-hosted</h3>
						{@render bullets([
							"Open source under the MIT license",
							"Your footage stays on your hardware",
							"Set up with one script and Docker",
						])}
						<div class="mt-auto card-actions">
							<a href="{DOCS}/self-hosting/installation" class="btn">Installation guide</a>
							<a href={GITHUB} class="btn btn-ghost">GitHub</a>
						</div>
					</div>
				</article>
			</div>
		</div>

		<footer class="mt-12 w-full border-t border-base-300 py-6 text-sm text-base-content/60">
			<div
				class="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between"
			>
				<div class="flex items-center gap-2">
					<Logo class="h-5 w-auto" />
					<span>&copy; 2026 PostPin Team</span>
				</div>
				<nav aria-label="Resources" class="flex flex-wrap justify-center gap-x-4 gap-y-1">
					<a class="link link-hover" href={DOCS}>Docs</a>
					<a class="link link-hover" href="{DOCS}/downloads">Downloads</a>
					<a class="link link-hover" href={GITHUB}>GitHub</a>
				</nav>
				<LegalLinks />
			</div>
		</footer>
	</section>
</main>

<style>
	/*
		One screen per slide; the scroller snaps to each (see +layout.svelte). The navbar floats over
		the top, so the background runs under it and the content starts below it.
	*/
	.slide {
		display: flex;
		align-items: center;
		min-height: 100dvh;
		padding: calc(var(--nav-height) + 1.5rem) 1rem 3rem;
		scroll-snap-align: start;
	}
	.hero {
		min-height: 88dvh;
		padding-bottom: 3.5rem;
	}

	/* bobs gently, so it reads as "there is more below" */
	.scroll-hint {
		transition: opacity 0.3s;
		animation: bob 2.4s ease-in-out infinite;
	}
	@keyframes bob {
		50% {
			translate: -50% 0.35rem;
		}
	}

	/* set by trackSlide: the content of a slide slides in a little when it comes into view */
	.slide:global([data-reveal]) > :global(*) {
		transition:
			opacity 0.7s ease-out,
			translate 0.7s ease-out;
	}
	.slide:global([data-reveal="hidden"]) > :global(*) {
		opacity: 0;
		translate: 0 1.5rem;
	}

	.card-lift {
		transition:
			translate 0.2s ease-out,
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.card-lift:hover {
		translate: 0 -0.25rem;
		box-shadow: var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1));
	}

	/* The logo builds itself on load: the bars grow one after another, then the pin drops in */
	:global(.intro-logo path) {
		transform-box: fill-box;
		transform-origin: bottom;
		animation: bar-grow 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	:global(.intro-logo circle) {
		transform-box: fill-box;
		animation: pin-drop 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) 0.75s both;
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
	@keyframes bar-grow {
		from {
			scale: 1 0;
		}
	}
	@keyframes pin-drop {
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
		.card-lift:hover {
			translate: none;
		}
		.scroll-hint {
			animation: none;
		}
	}
</style>
