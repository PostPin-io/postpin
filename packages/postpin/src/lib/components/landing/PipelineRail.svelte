<script lang="ts">
	import { onMount } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import Clapperboard from "@lucide/svelte/icons/clapperboard";
	import Logo from "#lib/components/layout/Logo.svelte";
	import Smartphone from "@lucide/svelte/icons/smartphone";

	// PipelineTimeline standing up, left of the steps of "How it works": one station next to each
	// step. The cut leaves the editor (1), is reviewed by the team (2) and the client (3), and on
	// the way on it turns into notes that land in the editor as markers (4).
	//
	// It follows the scrolling instead of running on a clock, and it is one step behind the page:
	// while a step comes up, what belongs to it is still on its way from the step before, and
	// reaches the station when the step is in the upper part of the screen. So at "Review with your
	// team" you see the cut arrive from the editor. The steps differ in height, so the stations are
	// placed where the steps are (measured in the browser). Icons and shapes only.
	//
	// No script moves anything: the traveller is a sticky element that the browser keeps at a
	// fixed height of the screen while the column scrolls by, between the first and the last
	// station. That is the same place a script would compute, but scrolling itself puts it there,
	// so it cannot lag behind (Safari tells scripts about scrolling late, which showed as stutter).
	// Script only measures where the steps are, and flips a few states at the stations.

	interface Props {
		class?: string;
	}
	let { class: className = "" }: Props = $props();

	const reducedMotion = new MediaQuery("prefers-reduced-motion: reduce");

	// One per step, in the order of the steps
	const stations = [
		{ icon: Clapperboard, label: "Your editor" },
		// the review happens in PostPin itself, so this station shows its logo
		{ icon: null, label: "Team review" },
		{ icon: Smartphone, label: "Client" },
		{ icon: Clapperboard, label: "Back in your editor" },
	];
	const LAST = stations.length - 1;

	/**
	 * Where on the screen a step has to be for the traveller to be at its station, from the top of
	 * the scrolling area. Above the middle, so the traveller is still on its way while the step
	 * is in the middle of the screen. The traveller sticks at this height (ARRIVE_AT as dvh below).
	 */
	const ARRIVE_AT = 0.35;

	/** The notes that land at the last station, in category colors */
	const markers = ["#f5b92f", "#e8559a", "#8a63d2", "#31b86a"];

	let box: HTMLElement;
	/** Centers of the steps, from the top of this column. Empty until measured. */
	let ys = $state<number[]>([]);
	// only these change while scrolling, and only now and then
	let isNotes = $state(false);
	let landed = $state(false);
	let at = $state(-1);
	let rings: HTMLElement[] = [];

	/** The element the page scrolls in; the landing layout scrolls inside a div, not the window */
	function scrollerOf(el: HTMLElement): HTMLElement | null {
		for (let parent = el.parentElement; parent; parent = parent.parentElement) {
			if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
		}
		return null;
	}

	onMount(() => {
		const section = box.closest("section");
		const steps = [...(section?.querySelectorAll<HTMLElement>("ol > li") ?? [])];
		if (!section || steps.length !== stations.length) return;
		const scroller = scrollerOf(box);
		const listenTo: HTMLElement | Window = scroller ?? window;
		const scrollTop = () => (scroller ? scroller.scrollTop : scrollY);
		const viewHeight = () => (scroller ? scroller.clientHeight : innerHeight);

		// measured once per size: centers of the steps in the column and in the scrolled content
		let inContent: number[] = [];
		const measure = () => {
			const columnTop = box.getBoundingClientRect().top;
			const contentTop = (scroller?.getBoundingClientRect().top ?? 0) - scrollTop();
			const rects = steps.map((step) => step.getBoundingClientRect());
			ys = rects.map((r) => r.top - columnTop + r.height / 2);
			inContent = rects.map((r) => r.top - contentTop + r.height / 2);
		};

		const update = () => {
			const line = scrollTop() + viewHeight() * ARRIVE_AT;
			// between the centers of two steps the traveller is between their stations
			let value = 0;
			for (let i = 0; i < LAST; i++) {
				const from = inContent[i]!;
				const to = inContent[i + 1]!;
				value = i + Math.min(Math.max((line - from) / (to - from), 0), 1);
				if (line < to) break;
			}
			// these only flip at the stations, so scrolling does not render the component
			isNotes = value > 2.02;
			landed = value > 2.9;
			at = Math.abs(value - Math.round(value)) < 0.08 ? Math.round(value) : -1;
		};

		let frame = 0;
		const onScroll = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		};
		measure();
		update();
		listenTo.addEventListener("scroll", onScroll, { passive: true });
		// the steps change height with the width of the window
		const observer = new ResizeObserver(() => {
			measure();
			update();
		});
		observer.observe(section);
		return () => {
			cancelAnimationFrame(frame);
			listenTo.removeEventListener("scroll", onScroll);
			observer.disconnect();
		};
	});

	// a ring pulses around a station when the traveller gets there
	$effect(() => {
		if (reducedMotion.current || at < 0) return;
		rings[at]?.animate(
			[
				{ opacity: 0.4, transform: "scale(1)" },
				{ opacity: 0, transform: "scale(1.4)" },
			],
			{ duration: 800, easing: "ease-out" },
		);
	});
</script>

<!--
	The column is as tall as the steps; nothing shows until the steps are measured. Sizes are
	for phones, from lg up the column is wider and everything in it bigger.
-->
<div bind:this={box} class="absolute inset-0 text-base-content {className}" aria-hidden="true">
	{#if ys.length === stations.length}
		<!-- the line the cut and the notes travel on, filled as far as the traveller has come -->
		<div
			class="absolute left-1/2 w-0.5 -translate-x-1/2 bg-current opacity-15"
			style="top: {ys[0]}px; height: {ys[LAST]! - ys[0]!}px"
		></div>
		<!--
			What travels, and the filled part of the line above it. The anchor sticks at a fixed
			height of the screen; this box is the stretch between the first and the last station,
			so the anchor stops at both, and clips the fill that hangs above the first one. Drawn
			before the stations, so the traveller disappears into the station it is at.
		-->
		<div
			class="absolute inset-x-0"
			style="top: {ys[0]}px; height: {ys[LAST]! - ys[0]!}px; clip-path: inset(0)"
		>
			<div class="sticky h-0" style="top: {ARRIVE_AT * 100}dvh">
				<div
					class="absolute bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary"
					style="height: {ys[LAST]! - ys[0]!}px"
				></div>
				<span
					class="absolute left-1/2 -mt-2 -ml-2 size-4 rounded-full bg-[#3d7fff] transition-opacity duration-200 lg:-mt-2.5 lg:-ml-2.5 lg:size-5 {isNotes
						? 'opacity-0'
						: 'opacity-100'}"
				></span>
				<svg
					viewBox="0 0 56 16"
					class="absolute left-1/2 -mt-1.5 -ml-5 h-3 w-10 transition-opacity duration-200 lg:-mt-2 lg:-ml-7 lg:h-4 lg:w-14 {isNotes
						? 'opacity-100'
						: 'opacity-0'}"
				>
					<path d="M8,0 l8,8 l-8,8 l-8,-8 z" fill="#f5b92f" />
					<path d="M28,0 l8,8 l-8,8 l-8,-8 z" fill="#e8559a" />
					<path d="M48,0 l8,8 l-8,8 l-8,-8 z" fill="#8a63d2" />
				</svg>
			</div>
		</div>

		{#each stations as station, i (i)}
			<div
				class="absolute left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center lg:size-14"
				style="top: {ys[i]}px"
				title={station.label}
			>
				<span
					bind:this={rings[i]}
					class="absolute inset-0 rounded-full border-2 border-current opacity-0"
				></span>
				<span
					class="grid size-10 place-items-center rounded-full border-2 bg-base-100 transition-colors duration-300 lg:size-14 {at ===
					i
						? 'border-primary'
						: 'border-base-content/20'}"
				>
					{#if station.icon}
						<station.icon class="size-4 opacity-60 lg:size-6" strokeWidth={1.5} />
					{:else}
						<!-- in its own colors, the one station that isn't gray -->
						<Logo class="h-4 w-auto lg:h-6" />
					{/if}
				</span>
			</div>
		{/each}

		<!-- the notes, back at the editor: under the last station, one after the other -->
		<div
			class="absolute left-1/2 flex -translate-x-1/2 gap-0.5 lg:mt-2.5 lg:gap-1"
			style="top: {ys[LAST]! + 30}px"
		>
			{#each markers as color, i (color)}
				<svg
					viewBox="0 0 12 12"
					class="size-2.5 transition-[opacity,transform] duration-300 lg:size-3 {landed ||
					reducedMotion.current
						? 'scale-100 opacity-100'
						: 'scale-50 opacity-0'}"
					style="transition-delay: {landed ? i * 150 : 0}ms"
				>
					<path d="M6,0 l6,6 l-6,6 l-6,-6 z" fill={color} />
				</svg>
			{/each}
		</div>
	{/if}
</div>
