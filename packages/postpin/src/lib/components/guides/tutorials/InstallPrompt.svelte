<script lang="ts">
	// The plugin question (docs/guides/tutorials/plugin-workflow.md, "The plugin question"): how the
	// install tutorials start on their own. Which one fits depends on the program, so it asks once,
	// on the export list, where the user is about to upload. No progress of its own: "No, thanks"
	// skips all install tutorials (after one confirmation, like every skip: rule 7), a
	// program starts its tutorial.
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import { GUIDE_STYLE } from "#lib/guides.ts";

	type InstallId = "install-resolve" | "install-premiere" | "install-desktop";

	interface Props {
		ondecline: () => void;
		/** startWith: what the tutorial starts with, the program for PostPin Desktop */
		onchoose: (id: InstallId, startWith?: Record<string, string>) => void;
	}
	let { ondecline, onchoose }: Props = $props();

	const style = GUIDE_STYLE.tutorial;
	// PostPin Desktop works with several programs: one tutorial, started for the one chosen
	const PROGRAMS: { id: InstallId; name: string; startWith?: Record<string, string> }[] = [
		{ id: "install-resolve", name: "DaVinci Resolve" },
		{ id: "install-premiere", name: "Premiere Pro" },
		{ id: "install-desktop", name: "Pro Tools", startWith: { program: "pro-tools" } },
		{ id: "install-desktop", name: "FilmCraft", startWith: { program: "filmcraft" } },
	];

	let step = $state<"ask" | "confirm" | "choose">("ask");
</script>

<div
	class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-base-300/70 px-4 py-6"
	role="dialog"
	aria-modal="true"
	aria-labelledby="install-prompt-title"
>
	<section class="card w-full max-w-lg bg-base-100 shadow-xl">
		<div class="card-body gap-5 p-6 sm:p-8">
			<div class="flex items-center gap-3">
				<span
					class="flex size-9 items-center justify-center rounded-full {style.dot} text-primary-content"
				>
					<GraduationCap class="size-5" />
				</span>
				<div class="text-xs font-semibold tracking-wide uppercase {style.text}">{style.label}</div>
			</div>

			{#if step === "ask"}
				<div class="space-y-2">
					<h2 id="install-prompt-title" class="text-2xl font-bold">Install a PostPin plugin?</h2>
					<p class="text-base-content/70">
						Upload exports straight from your editing program and get the markers back there.
					</p>
				</div>
				<div class="flex flex-wrap justify-end gap-3">
					<button type="button" class="btn btn-ghost" onclick={() => (step = "confirm")}>
						No, thanks
					</button>
					<button type="button" class="btn {style.button}" onclick={() => (step = "choose")}>
						Yes
					</button>
				</div>
			{:else if step === "confirm"}
				<!-- Skipping is a decision, never a slip: it asks once (rule 7) -->
				<div class="space-y-2" role="alertdialog" aria-labelledby="install-prompt-title">
					<h2 id="install-prompt-title" class="text-2xl font-bold">Skip the plugin tutorials?</h2>
					<p class="text-base-content/70">
						You can start them again under PostPin Guides in the account menu.
					</p>
				</div>
				<div class="flex flex-wrap justify-end gap-3">
					<button type="button" class="btn btn-ghost" onclick={ondecline}>Skip</button>
					<button type="button" class="btn {style.button}" onclick={() => (step = "ask")}>
						Back
					</button>
				</div>
			{:else}
				<h2 id="install-prompt-title" class="text-2xl font-bold">Which program do you work in?</h2>
				<div class="flex flex-wrap gap-3">
					{#each PROGRAMS as program (program.name)}
						<button
							type="button"
							class="btn {style.button}"
							onclick={() => onchoose(program.id, program.startWith)}
						>
							{program.name}
						</button>
					{/each}
				</div>
				<div>
					<button type="button" class="btn btn-ghost" onclick={() => (step = "ask")}>
						<ArrowLeft size={18} />
						Back
					</button>
				</div>
			{/if}
		</div>
	</section>
</div>
