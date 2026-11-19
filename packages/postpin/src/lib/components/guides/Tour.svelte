<script lang="ts">
	// A tour: one popover at a time on the element it explains, everything else dimmed and
	// blocked, see docs/guides/README.md ("How a tour behaves"). It follows the page instead of
	// driving it: steps wait for their element, and the user does the real thing (opens the
	// dialog, saves the link) rather than a demo of it.
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import { GUIDES, GUIDE_STYLE } from "#lib/guides.ts";
	import { showGuideFeedback } from "./guide-feedback.svelte.ts";
	import { untrack } from "svelte";
	import {
		fallbackStep,
		findAnchor,
		nextShownStep,
		placeCard,
		splitStepText,
		type TourDefinition,
	} from "./tour.ts";
	import { layerOf, moveInto } from "./top-layer.ts";

	interface Props {
		tour: TourDefinition;
		/** The user moved on to another step */
		onstep?: (stepId: string) => void;
		onfinish: () => void;
		onskip: () => void;
	}
	let { tour, onstep, onfinish, onskip }: Props = $props();

	const style = GUIDE_STYLE.tour;
	const title = $derived(GUIDES.find((g) => g.id === tour.guideId)?.title ?? "");

	let index = $state(untrack(() => nextShownStep(tour.steps, 0) ?? 0));
	const step = $derived(tour.steps[index]!);
	const isDone = $derived(step.advance === "done");
	/** A card in the middle of the screen, nothing highlighted */
	const isCentered = $derived(isDone || !!step.centered);
	/**
	 * The steps the user goes through (no completion card), as far as known at the start: the
	 * counter shouldn't jump over steps left out (e.g. the way to a page the tour starts on)
	 */
	const counted = untrack(() =>
		tour.steps.filter((s) => s.advance !== "done" && !s.skipIf?.()).map((s) => s.id),
	);
	const stepNumber = $derived(counted.indexOf(step.id) + 1);

	let root = $state<HTMLElement>();
	let card = $state<HTMLElement>();
	let anchor: HTMLElement | null = null;
	let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let cardWidth = $state(0);
	let cardHeight = $state(0);
	let viewport = $state({ width: 0, height: 0 });
	let confirmSkip = $state(false);

	const PAD = 6;
	/** A missing element gets this long to come back (a dialog re-rendering) before going back */
	const GRACE_MS = 800;

	let scrolled = false;
	let missingSince = 0;

	function go(next: number) {
		index = next;
		scrolled = false;
		confirmSkip = false;
		onstep?.(tour.steps[next]!.id);
	}

	function advance() {
		if (step.feedback) showGuideFeedback(step.feedback, "tour");
		const next = nextShownStep(tour.steps, index + 1);
		if (next === null) onfinish();
		else go(next);
	}

	// Every frame: elements move (scrolling, dialogs animating in), appear and disappear
	$effect(() => {
		let frame = 0;
		const tick = () => {
			frame = requestAnimationFrame(tick);
			viewport = { width: window.innerWidth, height: window.innerHeight };
			const current = tour.steps[index]!;
			if (current.advance === "done" || current.centered) {
				// stays in the layer it is in: a dialog the tour led into stays open behind the card
				anchor = null;
				rect = null;
				return;
			}
			const nextIndex = nextShownStep(tour.steps, index + 1);
			const next = nextIndex === null ? undefined : tour.steps[nextIndex];
			if (current.advance === "appears" && next && findAnchor(tour.guideId, next.id)) {
				advance();
				return;
			}
			const el = findAnchor(tour.guideId, current.id);
			anchor = el;
			if (el) {
				missingSince = 0;
				if (!scrolled) {
					el.scrollIntoView({ block: "nearest", inline: "nearest" });
					scrolled = true;
				}
				const r = el.getBoundingClientRect();
				rect = { top: r.top, left: r.left, width: r.width, height: r.height };
				if (root) moveInto(root, layerOf(el));
				return;
			}
			rect = null;
			missingSince ||= performance.now();
			if (performance.now() - missingSince < GRACE_MS) return;
			if (current.optional) {
				missingSince = 0;
				advance();
				return;
			}
			// after a navigation: the page is still on its way
			if (current.waitForElement) return;
			const back = fallbackStep(index, (i) => !!findAnchor(tour.guideId, tour.steps[i]!.id));
			if (back !== null) {
				missingSince = 0;
				go(back);
			}
		};
		tick();
		return () => cancelAnimationFrame(frame);
	});

	const visible = $derived(isCentered || !!rect);
	/** May be used while the tour runs: the card, and the highlighted element unless it's inert */
	const allowed = (target: EventTarget | null) => {
		if (!(target instanceof Node)) return false;
		if (card?.contains(target)) return true;
		if (!anchor || step.inert) return false;
		return (
			anchor.contains(target) ||
			// a label passes its click on to its input (e.g. the checkbox of the mobile menu)
			(anchor instanceof HTMLLabelElement && anchor.control === target)
		);
	};

	$effect(() => {
		// "click" steps: the click itself does its job, the tour only takes note
		const onClick = (event: MouseEvent) => {
			if (!visible) return;
			if (!allowed(event.target)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
			if (step.advance === "click" && anchor?.contains(event.target as Node)) advance();
		};
		// Escape neither closes a dialog nor the tour; shortcuts only where the user may act
		const onKey = (event: KeyboardEvent) => {
			if (!visible) return;
			if (event.key === "Escape" || !allowed(event.target)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		};
		// a modal dialog closes on Escape through "cancel", whatever happened to the key
		const onCancel = (event: Event) => {
			if (visible) event.preventDefault();
		};
		const onFocus = (event: FocusEvent) => {
			if (visible && !allowed(event.target)) card?.focus();
		};
		// A press on the dimming must not take the focus away either: menus that are open while
		// they have it (the account menu) would close under the tour
		const onPointerDown = (event: MouseEvent) => {
			if (visible && !allowed(event.target)) event.preventDefault();
		};
		window.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("mousedown", onPointerDown, true);
		window.addEventListener("click", onClick, true);
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("cancel", onCancel, true);
		window.addEventListener("focusin", onFocus, true);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("mousedown", onPointerDown, true);
			window.removeEventListener("click", onClick, true);
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("cancel", onCancel, true);
			window.removeEventListener("focusin", onFocus, true);
		};
	});

	// The node is moved into dialogs; Svelte only removes it where it put it, so this does
	function owned(node: HTMLElement) {
		return () => node.remove();
	}

	const hole = $derived(
		rect && {
			top: rect.top - PAD,
			left: rect.left - PAD,
			width: rect.width + 2 * PAD,
			height: rect.height + 2 * PAD,
		},
	);
	const position = $derived(
		hole
			? placeCard(
					{ top: hole.top, bottom: hole.top + hole.height, left: rect!.left, width: rect!.width },
					{ width: cardWidth, height: cardHeight },
					viewport,
				)
			: {
					top: Math.max(8, (viewport.height - cardHeight) / 2),
					left: Math.max(8, (viewport.width - cardWidth) / 2),
				},
	);
</script>

<!-- The guide button, as the user will meet it next to a feature -->
{#snippet stepText(text: string)}
	{#each splitStepText(text) as part, i (i)}
		{#if i > 0}
			<span
				class="mx-0.5 inline-flex size-5 items-center justify-center rounded-full align-middle {style.dot} text-accent-content"
				role="img"
				aria-label="guide button"
			>
				<GraduationCap class="size-3" />
			</span>
		{/if}{part}
	{/each}
{/snippet}

<div
	bind:this={root}
	class="pointer-events-none fixed inset-0 z-[1000]"
	class:hidden={!visible}
	{@attach owned}
>
	{#if hole}
		<!-- The dimming, with a ring around the highlighted element -->
		<div
			class="absolute rounded-lg ring-2 transition-all duration-150 {style.ring}"
			style:top="{hole.top}px"
			style:left="{hole.left}px"
			style:width="{hole.width}px"
			style:height="{hole.height}px"
			style:box-shadow="0 0 0 9999px oklch(0% 0 0 / 0.55)"
		></div>
		<!-- Four blockers around the hole: only the highlighted element takes clicks -->
		<div
			class="pointer-events-auto absolute inset-x-0 top-0"
			style:height="{Math.max(0, hole.top)}px"
		></div>
		<div
			class="pointer-events-auto absolute inset-x-0 bottom-0"
			style:top="{hole.top + hole.height}px"
		></div>
		<div
			class="pointer-events-auto absolute left-0"
			style:top="{hole.top}px"
			style:height="{hole.height}px"
			style:width="{Math.max(0, hole.left)}px"
		></div>
		<div
			class="pointer-events-auto absolute right-0"
			style:top="{hole.top}px"
			style:height="{hole.height}px"
			style:left="{hole.left + hole.width}px"
		></div>
	{:else if isCentered}
		<div class="pointer-events-auto absolute inset-0 bg-black/55"></div>
	{/if}

	<div
		bind:this={card}
		class="pointer-events-auto absolute w-80 max-w-[calc(100vw-1rem)] rounded-box bg-base-100 p-4 text-base-content shadow-2xl ring-2 outline-none {style.ring}"
		style:top="{position.top}px"
		style:left="{position.left}px"
		bind:offsetWidth={cardWidth}
		bind:offsetHeight={cardHeight}
		role="dialog"
		aria-label="{style.label}: {title}"
		tabindex="-1"
		onmousedown={(e) => {
			// its buttons work without taking the focus: an open menu stays open behind it
			if (e.target !== e.currentTarget) e.preventDefault();
		}}
	>
		<div class="flex items-center gap-2 text-xs font-semibold {style.text}">
			<GraduationCap class="size-4" />
			{style.label} · {title}
			{#if !isDone}
				<span class="ml-auto font-normal text-base-content/50">{stepNumber} / {counted.length}</span
				>
			{/if}
		</div>

		{#if confirmSkip}
			<h3 class="mt-2 font-bold">Skip this tour?</h3>
			<p class="mt-1 text-sm text-base-content/80">
				You can start it again under PostPin Guides in the account menu.
			</p>
			<div class="mt-3 flex items-center justify-end gap-2">
				<button type="button" class="btn btn-ghost btn-sm" onclick={onskip}>Skip</button>
				<button
					type="button"
					class="btn btn-sm {style.button}"
					onclick={() => (confirmSkip = false)}
				>
					Continue tour
				</button>
			</div>
		{:else if isDone}
			<div class="mt-3 flex flex-col items-center gap-2 text-center">
				<CircleCheck class="size-10 text-success" />
				<h3 class="font-bold">{step.title}</h3>
				<p class="text-sm text-base-content/80">{@render stepText(step.text)}</p>
			</div>
			<button type="button" class="btn mt-4 w-full btn-sm {style.button}" onclick={onfinish}>
				Done
			</button>
		{:else}
			<h3 class="mt-2 font-bold">{step.title}</h3>
			<p class="mt-1 text-sm text-base-content/80">{@render stepText(step.text)}</p>
			<div class="mt-3 flex items-center gap-2">
				<button type="button" class="btn btn-ghost btn-xs" onclick={() => (confirmSkip = true)}>
					Skip tour
				</button>
				<span class="flex-1"></span>
				{#if step.advance === "next"}
					<button type="button" class="btn btn-sm {style.button}" onclick={advance}>
						{step.nextLabel ?? "Next"}
					</button>
				{:else if step.advance === "click"}
					<span class="text-xs text-base-content/60">Click the highlighted element</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
