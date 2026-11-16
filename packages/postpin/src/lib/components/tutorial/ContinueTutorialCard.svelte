<script lang="ts">
	// On the dashboard while the tutorial runs: where it goes on
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import { WELCOME_STEPS, isWelcomeStep } from "#lib/tutorial.ts";
	import { finishTutorial, getTutorialState } from "./tutorial.remote.ts";

	const tutorial = $derived(await getTutorialState());
	const step = $derived(tutorial.step);

	const exportHref = $derived(
		tutorial.project && tutorial.timeline && tutorial.export
			? `/projects/${tutorial.project.id}/timelines/${tutorial.timeline.id}/exports/${tutorial.export.id}`
			: null,
	);

	// "Account" is the first of the five steps
	const next = $derived.by(() => {
		if (isWelcomeStep(step)) {
			return {
				text: `Continue the tutorial (step ${WELCOME_STEPS.indexOf(step) + 2} of ${WELCOME_STEPS.length + 1})`,
				href: "/welcome",
				action: "Continue",
			};
		}
		if (!exportHref || !tutorial.export) return null;
		if (step === "review") {
			return {
				text: `Your first export is ready. Open ${tutorial.export.name} to see how markers and sharing work.`,
				href: exportHref,
				action: "Open export",
			};
		}
		return null;
	});

	async function skip() {
		await finishTutorial();
		await getTutorialState().refresh();
	}
</script>

{#if next}
	<div
		class="mb-6 flex flex-wrap items-center gap-3 rounded-box border border-primary/30 bg-primary/5 p-4"
	>
		<GraduationCap class="size-6 shrink-0 text-primary" />
		<p class="min-w-0 flex-1 basis-48 text-sm break-words">{next.text}</p>
		<div class="flex gap-2 max-sm:w-full">
			<button type="button" class="btn btn-ghost btn-sm" onclick={skip}>Skip tutorial</button>
			<a class="btn btn-primary btn-sm max-sm:flex-1" href={next.href}>
				{next.action}
				<ArrowRight size={14} />
			</a>
		</div>
	</div>
{/if}
