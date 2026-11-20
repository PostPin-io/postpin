<script lang="ts">
	// docs/guides/tutorials/sync-to-nle.md: keep both in step.
	// The plugin's panel, from the program to PostPin, and markers there and back once. It all
	// happens in the plugin, so most steps go on with "Next" and a sketch of the panel shows where.
	// The two syncs leave a marker set on the server: those steps wait for it (getPluginTutorial).
	import { untrack } from "svelte";
	import { goto } from "$app/navigation";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import { GUIDE_STYLE } from "#lib/guides.ts";
	import { programByHost, type PluginProgram } from "#lib/plugin-programs.ts";
	import TutorialShell from "../TutorialShell.svelte";
	import { showGuideFeedback } from "../guide-feedback.svelte.ts";
	import { getPluginTutorial, type GuideProgressEntry } from "../guides.remote.ts";
	import PluginPanelShot, { type PanelArea, type PanelProgram } from "./PluginPanelShot.svelte";

	const STEPS = [
		"open-plugin",
		"program",
		"upload-to",
		"render-upload",
		"render-to-disk",
		"exchange-with",
		"markers",
		"to-program",
		"see-markers",
		"add-marker",
		"to-postpin",
		"history",
		"done",
	] as const;
	type Step = (typeof STEPS)[number];

	const LABELS: Record<Step, string> = {
		"open-plugin": "Open the plugin",
		program: "The program",
		"upload-to": "Upload to",
		"render-upload": "Render & Upload",
		"render-to-disk": "Render to disk",
		"exchange-with": "Exchange markers with",
		markers: "Markers",
		"to-program": "Bring them over",
		"see-markers": "On the timeline",
		"add-marker": "Add one",
		"to-postpin": "Send it back",
		history: "History",
		done: "Done",
	};

	/** Where each step is in the panel */
	const AREAS: Record<Step, PanelArea | null> = {
		"open-plugin": null,
		program: "program",
		"upload-to": "upload-to",
		"render-upload": "render-upload",
		"render-to-disk": "render-to-disk",
		"exchange-with": "exchange-with",
		markers: "markers",
		"to-program": "to-program",
		"see-markers": "program",
		"add-marker": "program",
		"to-postpin": "to-postpin",
		history: "history",
		done: null,
	};

	/** The screenshot per program (plugin-core: run screenshots) */
	const SHOTS: Record<string, PanelProgram> = {
		Resolve: "resolve",
		"Premiere Pro": "premiere",
		"Pro Tools": "protools",
	};

	interface Props {
		progress: GuideProgressEntry | undefined;
		save: (status: GuideStatus, step?: string, context?: Record<string, string>) => Promise<void>;
	}
	let { progress, save }: Props = $props();

	const style = GUIDE_STYLE.tutorial;

	const tutorialQuery = getPluginTutorial();
	const info = $derived(await tutorialQuery);

	// Before the first sync and without a signed-in plugin nothing says which program it is
	const FALLBACK: PluginProgram = {
		hostName: "",
		name: "your editing program",
		clientId: "",
		plugin: "the PostPin plugin",
		marker: { one: "marker", many: "markers" },
		renderToDisk: false,
	};
	const program = $derived(programByHost(info.program) ?? FALLBACK);
	const m = $derived(program.marker);
	const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

	// Only programs that can render to disk get that step
	const steps = $derived(STEPS.filter((s) => s !== "render-to-disk" || program.renderToDisk));

	// Taken over once: from here on this component is ahead of what is stored
	const stored = untrack(() => $state.snapshot(progress));
	let step = $state<Step>(
		STEPS.includes(stored?.step as Step) ? (stored!.step as Step) : "open-plugin",
	);
	$effect.pre(() => {
		// render to disk isn't there for this program (any more)
		if (!steps.includes(step)) step = "exchange-with";
	});

	// The marker sets there were when a waiting step began: only a newer one counts
	let pullBefore = $state(untrack(() => stored?.context?.pullBefore ?? ""));
	let pushBefore = $state(untrack(() => stored?.context?.pushBefore ?? ""));
	// The export the marker went to, for "Open your export"
	let pushHref = $state(untrack(() => stored?.context?.pushHref ?? ""));

	const context = () => ({ pullBefore, pushBefore, pushHref });

	async function moveTo(next: Step) {
		if (next === "to-program" || next === "to-postpin") {
			// what's on the server now is "before": a sync from earlier doesn't count
			await tutorialQuery.refresh().catch(() => {});
			const now = tutorialQuery.current;
			if (next === "to-program") pullBefore = now?.pullId ?? "";
			else pushBefore = now?.push?.id ?? "";
		}
		step = next;
		await save(GuideStatus.STARTED, next, context());
	}

	const offset = (by: number) => steps[steps.indexOf(step) + by]!;

	// First visit: store where it started, so a reload goes on there
	$effect(() => {
		if (!stored) untrack(() => moveTo(step));
	});

	// A sync shows up as a new marker set
	$effect(() => {
		if (step === "to-program" && info.pullId && info.pullId !== pullBefore) {
			untrack(() => {
				showGuideFeedback(`Your ${m.many} are in ${program.name}`, "tutorial");
				void moveTo("see-markers");
			});
		} else if (step === "to-postpin" && info.push && info.push.id !== pushBefore) {
			const href = info.push.href;
			untrack(() => {
				pushHref = href ?? "";
				showGuideFeedback(`Your ${m.one} is in PostPin`, "tutorial");
				void moveTo("history");
			});
		}
	});

	// The sync happens in the plugin: look for it every few seconds
	$effect(() => {
		if (step !== "to-program" && step !== "to-postpin") return;
		const interval = setInterval(() => {
			if (!document.hidden) void tutorialQuery.refresh();
		}, 3000);
		return () => clearInterval(interval);
	});

	const exportPath = $derived(
		info.export
			? `${info.export.project} › ${info.export.timeline} › ${info.export.name}`
			: `an export with ${m.many}`,
	);
	const openHref = $derived(pushHref || info.export?.href || "");

	async function finish(open: boolean) {
		await save(GuideStatus.COMPLETED);
		if (open && openHref) await goto(openHref);
	}
</script>

{#snippet nav(next = true)}
	<div class="flex flex-wrap items-center justify-between gap-3">
		{#if step !== steps[0]}
			<button type="button" class="btn btn-ghost" onclick={() => moveTo(offset(-1))}>
				<ArrowLeft size={18} />
				Back
			</button>
		{:else}
			<span></span>
		{/if}
		{#if next}
			<button type="button" class="btn btn-lg {style.button}" onclick={() => moveTo(offset(1))}>
				Next
				<ArrowRight size={18} />
			</button>
		{/if}
	</div>
{/snippet}

{#snippet waiting(text: string)}
	<div class="flex items-center gap-3 text-base-content/70" role="status" aria-live="polite">
		<span class="loading loading-sm loading-spinner {style.text}"></span>
		{text}
	</div>
{/snippet}

<TutorialShell
	guideId="sync-to-nle"
	wide
	steps={steps.map((s) => LABELS[s])}
	current={steps.indexOf(step)}
	onskip={() => save(GuideStatus.SKIPPED)}
>
	{#if step === "done"}
		<div class="flex flex-col items-center gap-3 text-center">
			<CircleCheck class="size-14 text-success" />
			<h2 class="text-2xl font-bold">You're set up in {program.name}</h2>
			<p class="text-base-content/70">
				Bring the {m.many} over before you start and send them back when you're done; only what changed
				travels.
			</p>
			<p class="text-sm text-base-content/60">More under PostPin Guides in the account menu.</p>
		</div>
		<div class="flex flex-wrap justify-center gap-3">
			{#if openHref}
				<button type="button" class="btn btn-lg {style.button}" onclick={() => finish(true)}>
					Open your export
				</button>
			{/if}
			<button
				type="button"
				class="btn btn-lg {openHref ? 'btn-ghost' : style.button}"
				onclick={() => finish(false)}
			>
				Done
			</button>
		</div>
	{:else}
		<PluginPanelShot
			program={SHOTS[program.hostName] ?? "resolve"}
			programName={program.name}
			highlight={AREAS[step]}
		/>

		{#if step === "open-plugin"}
			<h2 class="text-2xl font-bold">Open the plugin</h2>
			<p class="text-base-content/70">
				{#if program.hostName === "Pro Tools"}
					Open PostPin Desktop next to Pro Tools, with the session you're working on.
				{:else}
					Open the PostPin plugin in {program.name}, with the timeline you're working on.
				{/if}
			</p>
			{@render nav()}
		{:else if step === "program"}
			<h2 class="text-2xl font-bold">{capitalized(program.name)}</h2>
			<p class="text-base-content/70">
				The plugin automatically picks the timeline that's open in {program.name}.
			</p>
			{@render nav()}
		{:else if step === "upload-to"}
			<h2 class="text-2xl font-bold">Where exports go</h2>
			<p class="text-base-content/70">
				Under <strong>Upload to</strong>, choose the PostPin timeline for your exports. You can
				create a project or timeline right there.
			</p>
			{@render nav()}
		{:else if step === "render-upload"}
			<h2 class="text-2xl font-bold">Render & Upload</h2>
			<p class="text-base-content/70">
				Renders your timeline and uploads it to PostPin for review.
			</p>
			{@render nav()}
		{:else if step === "render-to-disk"}
			<h2 class="text-2xl font-bold">Also a file for you</h2>
			<p class="text-base-content/70">
				With the settings button next to it, the same render also lands in a folder of your choice.
			</p>
			{@render nav()}
		{:else if step === "exchange-with"}
			<h2 class="text-2xl font-bold">Choose the export for {m.many}</h2>
			<p class="text-base-content/70">
				Under <strong>Exchange markers with</strong>, choose the export whose {m.many} you want, for now:
				<strong class="break-words">{exportPath}</strong>. The plugin remembers it for this
				timeline.
			</p>
			{@render nav()}
		{:else if step === "markers"}
			<h2 class="text-2xl font-bold">{capitalized(m.many)} go both ways</h2>
			<p class="text-base-content/70">
				The arrow on each button in <strong>Markers</strong> shows where the {m.many} go. Before anything
				changes, the plugin shows a preview of what will change.
			</p>
			{@render nav()}
		{:else if step === "to-program"}
			<h2 class="text-2xl font-bold">Bring the {m.many} over</h2>
			<p class="text-base-content/70">
				Click the button with the arrow from PostPin to {program.name}. The preview lists what comes
				in; click <strong>Apply</strong>.
			</p>
			{@render waiting(`Waiting for the ${m.many} to arrive in ${program.name}…`)}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<button type="button" class="btn btn-ghost" onclick={() => moveTo(offset(-1))}>
					<ArrowLeft size={18} />
					Back
				</button>
				<!-- the markers are there already: nothing changes, so no trace on the server -->
				<button type="button" class="link text-sm link-hover" onclick={() => moveTo(offset(1))}>
					The plugin says Nothing to sync
				</button>
			</div>
		{:else if step === "see-markers"}
			<h2 class="text-2xl font-bold">Your {m.many} are on the timeline</h2>
			<p class="text-base-content/70">
				A {m.one}'s category comes along as its color, and its name as a #tag in the description.
				Keep the tag, it keeps the category when the {m.one} goes back.
			</p>
			{@render nav()}
		{:else if step === "add-marker"}
			<h2 class="text-2xl font-bold">Add a {m.one}</h2>
			<p class="text-base-content/70">
				Add a {m.one} on the timeline in {program.name}, or change one. {capitalized(m.many)} without
				a #tag get a category named after their color.
			</p>
			{@render nav()}
		{:else if step === "to-postpin"}
			<h2 class="text-2xl font-bold">Send it back</h2>
			<p class="text-base-content/70">
				Click the button with the arrow from {program.name} to PostPin, and click
				<strong>Apply</strong>.
			</p>
			{@render waiting(`Waiting for your ${m.one} to arrive in PostPin…`)}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<button type="button" class="btn btn-ghost" onclick={() => moveTo(offset(-1))}>
					<ArrowLeft size={18} />
					Back
				</button>
				<button type="button" class="link text-sm link-hover" onclick={() => moveTo(offset(1))}>
					I did it
				</button>
			</div>
		{:else if step === "history"}
			<h2 class="text-2xl font-bold">Every sync can be undone</h2>
			<p class="text-base-content/70">
				<span class="inline-flex items-center gap-1 align-middle font-semibold"
					><HistoryIcon class="size-4" />History</span
				>
				under the marker buttons lists every sync, with a backup taken before it. Undo brings the {m.many}
				back as they were.
			</p>
			{@render nav()}
		{/if}
	{/if}
</TutorialShell>
