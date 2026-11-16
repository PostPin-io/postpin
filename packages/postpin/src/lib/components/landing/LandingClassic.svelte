<!--
	The landing page as it was before the slides: one long scroll page (/landing/1). Only kept to
	compare the versions. /landing/4 swaps in its own first screen through the hero snippet and
	keeps everything below it.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import Logo from "#lib/components/layout/Logo.svelte";
	import LegalLinks from "#lib/components/layout/LegalLinks.svelte";
	import LandingNav from "#lib/components/landing/LandingNav.svelte";
	import Shot from "#lib/components/landing/Shot.svelte";

	import Projector from "@lucide/svelte/icons/projector";
	import LayoutGrid from "@lucide/svelte/icons/layout-grid";
	import Tags from "@lucide/svelte/icons/tags";
	import Scissors from "@lucide/svelte/icons/scissors";
	import Layers from "@lucide/svelte/icons/layers";
	import Smartphone from "@lucide/svelte/icons/smartphone";
	import Upload from "@lucide/svelte/icons/upload";
	import Check from "@lucide/svelte/icons/check";

	const DOCS = "https://docs.postpin.io";
	const GITHUB = "https://github.com/PostPin-io/postpin";
	const INSTALL_SCRIPT =
		"https://github.com/PostPin-io/postpin/releases/latest/download/install.sh";

	const steps = [
		{
			title: "One-click upload from your editor",
			text: "One click in your editor renders the timeline and uploads it to PostPin. Every upload becomes a new version, and earlier versions keep their notes.",
			shot: {
				name: "resolve-main",
				alt: "PostPin in DaVinci Resolve with the Render & Upload button",
				width: 1400,
				height: 713,
			},
		},
		{
			title: "Review with your team",
			text: "Invite your team to the project. Everyone adds notes on the exact frame or across a whole shot, sorts them by department and discusses them in replies. Under the player, PostPin shows your timeline with all its cuts.",
			shot: {
				name: "review-marker",
				alt: "Adding a note on the review page",
				width: 1600,
				height: 1000,
				themed: true,
			},
		},
		{
			title: "Get feedback from your client",
			text: "Send your client a link. They type their name and start adding notes, no account needed. They see the video and their own notes, nothing else.",
			shot: {
				name: "share-view",
				alt: "A client adding notes through a share link",
				width: 1600,
				height: 1000,
				themed: true,
			},
		},
		{
			title: "Bring the notes back",
			text: "Pull the notes into your timeline as markers, in the colors of their categories. Work through them, upload the next version and pull again when the new notes are in.",
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
			text: "Play a cut on a projector or TV for the whole room. Everyone scans a QR code and adds notes from their phone while you control playback.",
		},
		{
			icon: LayoutGrid,
			title: "Shot grid",
			text: "See every shot of the cut as a thumbnail and jump to one with a click.",
		},
		{
			icon: Scissors,
			title: "Cut detection",
			text: "Upload any video and PostPin finds the cuts for you. They become the shot grid and the timeline under the player. Too many or too few? Change the sensitivity afterwards, or take the cuts from an EDL or FCPXML.",
		},
		{
			icon: Tags,
			title: "Categories",
			text: "Sort notes by department, like Edit, Color, Sound or VFX. Presets match the marker colors of Resolve, Premiere, Avid and Final Cut.",
		},
		{
			icon: Layers,
			title: "Versions",
			text: "Every upload is a new version with its own notes. Copy the open ones over to the next version.",
		},
		{
			icon: Smartphone,
			title: "Phone and tablet",
			text: "Review on the go. The video plays in up to 4K and switches to a lower quality on a slow connection.",
		},
	];

	const editors = [
		{ name: "DaVinci Resolve Studio", icon: "davinci-resolve", docs: "/plugins/resolve" },
		{ name: "Adobe Premiere Pro", icon: "premiere-pro", docs: "/plugins/premiere" },
		{ name: "Avid Pro Tools", icon: "pro-tools", docs: "/plugins/desktop" },
	];

	// hero replaces the default first screen below. rail is a narrow column left of the steps of "How
	// it works", as tall as they are; it also pulls that section up so the first step is
	// in the first screen.
	let {
		hero,
		rail,
		wideNav = false,
		brandHidden = false,
	}: { hero?: Snippet; rail?: Snippet; wideNav?: boolean; brandHidden?: boolean } = $props();
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

<LandingNav wide={wideNav} {brandHidden} />

<main>
	{#if hero}
		{@render hero()}
	{:else}
		<!-- Hero -->
		<section class="px-4 pt-16 pb-12 sm:pt-24">
			<div class="mx-auto max-w-3xl text-center">
				<span class="badge badge-soft badge-primary">Free while in early access</span>
				<h1 class="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-6xl">
					From your timeline to your client and back
				</h1>
				<p class="mx-auto mt-6 max-w-2xl text-lg text-pretty text-base-content/70">
					Upload a cut straight from your favorite editing software. Your team and your clients
					leave notes in the browser, and the notes come back to your timeline as markers.
				</p>
				<div class="mt-8 flex flex-wrap justify-center gap-2">
					<a href="/auth/signup" class="btn btn-lg btn-primary">Create an account</a>
					<a href="#how-it-works" class="btn btn-lg">How it works</a>
				</div>
				<p class="mt-4 text-sm text-base-content/60">
					<a class="link" href="#editors">Supported editors</a> · Cloud or self-hosted · Open source
				</p>
			</div>
			<div class="mx-auto mt-12 max-w-6xl">
				<Shot
					name="review"
					alt="The PostPin review page with the player, the timeline from the editor and the notes"
					width={2000}
					height={1250}
					themed
					eager
					fullWidth
				/>
			</div>
		</section>
	{/if}

	<!-- How it works -->
	<section
		id="how-it-works"
		class="scroll-mt-20 bg-base-200 px-4 {rail ? 'pt-8 pb-16 sm:pt-10 sm:pb-24' : 'py-16 sm:py-24'}"
	>
		<!--
			With a rail, the heading and the steps share a grid with a narrow column on the left: the
			rail sits in the row of the steps, as tall as they are, and lines its stations up with them
		-->
		<div
			class="mx-auto max-w-6xl {rail
				? 'grid grid-cols-[2.75rem_1fr] [grid-template-rows:auto_1fr] gap-x-3 sm:grid-cols-[3.5rem_1fr] sm:gap-x-4 lg:grid-cols-[4rem_1fr] lg:gap-x-6'
				: ''}"
		>
			<h2 class="text-3xl font-bold tracking-tight sm:text-4xl {rail ? 'col-start-2' : ''}">
				How it works
			</h2>
			{#if rail}
				<div class="relative col-start-1 row-start-2">
					{@render rail()}
				</div>
			{/if}
			<ol class="{rail ? 'col-start-2 row-start-2 mt-8' : 'mt-12'} space-y-16">
				{#each steps as step, i (step.title)}
					<li class="grid items-center gap-8 md:grid-cols-5">
						<div class="md:col-span-2 {i % 2 ? 'md:order-2' : ''}">
							<span
								class="grid size-9 place-items-center rounded-full bg-primary font-semibold text-primary-content"
								>{i + 1}</span
							>
							<h3 class="mt-4 text-2xl font-semibold">{step.title}</h3>
							<p class="mt-3 text-base-content/70">{step.text}</p>
						</div>
						<Shot {...step.shot} fullWidth class="md:col-span-3" />
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- Features -->
	<section id="features" class="scroll-mt-20 px-4 py-16 sm:py-24">
		<div class="mx-auto max-w-6xl">
			<h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Features</h2>
			<div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature (feature.title)}
					<article class="card border border-base-300 bg-base-100">
						<div class="card-body">
							<feature.icon class="size-6 text-primary" />
							<h3 class="card-title text-base">{feature.title}</h3>
							<p class="text-sm text-base-content/70">{feature.text}</p>
						</div>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<!-- Supported editors -->
	<section id="editors" class="scroll-mt-20 bg-base-200 px-4 py-16 sm:py-24">
		<div class="mx-auto max-w-6xl">
			<h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Supported editors</h2>
			<p class="mt-4 max-w-2xl text-base-content/70">
				Upload and pull notes right from your editor, on macOS and Windows.
			</p>
			<div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each editors as editor (editor.name)}
					<a
						href="{DOCS}{editor.docs}"
						class="card border border-base-300 bg-base-100 transition-colors hover:border-primary"
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
					class="card border border-dashed border-base-300 bg-base-100 transition-colors hover:border-primary"
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

	<!-- Hosting -->
	<section id="hosting" class="scroll-mt-20 px-4 py-16 sm:py-24">
		<div class="mx-auto max-w-6xl">
			<h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Cloud or self-hosted</h2>
			<div class="mt-10 grid gap-4 md:grid-cols-2">
				<article class="card border border-base-300 bg-base-100">
					<div class="card-body gap-5">
						<div>
							<h3 class="card-title text-xl">Cloud</h3>
							<p class="mt-1 text-base-content/70">Sign up on postpin.io and start right away.</p>
						</div>
						{@render bullets([
							"Free while in early access",
							"Servers in the EU",
							"Nothing to install or update on a server",
							"Your editor connects to it without any setup",
						])}
						<div class="mt-auto card-actions">
							<a href="/auth/signup" class="btn btn-primary">Create an account</a>
						</div>
					</div>
				</article>
				<article class="card border border-base-300 bg-base-100">
					<div class="card-body gap-5">
						<div>
							<h3 class="card-title text-xl">Self-hosted</h3>
							<p class="mt-1 text-base-content/70">Run PostPin on your own server with Docker.</p>
						</div>
						{@render bullets([
							"Open source under the MIT license",
							"Your footage stays on your own hardware",
							"A setup script asks for your domains and email settings",
						])}
						<div class="mockup-code text-sm">
							<pre data-prefix="$"><code>curl -fsSLO {INSTALL_SCRIPT}</code></pre>
							<pre data-prefix="$"><code>bash install.sh</code></pre>
						</div>
						<div class="mt-auto card-actions">
							<a href="{DOCS}/self-hosting/installation" class="btn">Installation guide</a>
							<a href={GITHUB} class="btn btn-ghost">GitHub</a>
						</div>
					</div>
				</article>
			</div>
		</div>
	</section>
</main>

<footer class="border-t border-base-300 px-4 py-8 text-sm text-base-content/60">
	<div class="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
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
