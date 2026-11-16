<script lang="ts">
	// Part 1 of the tutorial: from a fresh account to the first export. The step shown is derived
	// from what exists (see #lib/tutorial.ts), so a reload or the plugin can't get it out of step.
	import { dev } from "$app/env";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import ExternalLink from "@lucide/svelte/icons/external-link";
	import Upload from "@lucide/svelte/icons/upload";
	import { authClient } from "#lib/auth-client.ts";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import UploadModal from "#lib/components/exports/UploadModal.svelte";
	import { createOrganization } from "#lib/components/organizations/create-org.ts";
	import { createProject } from "#lib/components/projects/projects.remote.ts";
	import { createTimeline } from "#lib/components/timelines/timelines.remote.ts";
	import { DOC_LINKS, HOSTED_ORIGIN } from "#lib/components/tutorial/doc-links.ts";
	import InfoBox from "#lib/components/tutorial/InfoBox.svelte";
	import PluginGuide from "#lib/components/tutorial/PluginGuide.svelte";
	import TutorialSteps from "#lib/components/tutorial/TutorialSteps.svelte";
	import UploadWaiter from "#lib/components/tutorial/UploadWaiter.svelte";
	import { finishTutorial, getTutorialState } from "#lib/components/tutorial/tutorial.remote.ts";
	import { isWelcomeStep, WELCOME_STEPS } from "#lib/tutorial.ts";

	const tutorial = $derived(await getTutorialState());
	// Once the export plays, the tutorial goes on at the export; this page then only points there
	const step = $derived(isWelcomeStep(tutorial.step) ? tutorial.step : "upload");

	// Not in the tutorial (finished, skipped, or invited into someone's organization)
	$effect(() => {
		if (tutorial.step === null) void goto("/dashboard", { replaceState: true });
	});

	// The upload comes from the editing software: nothing here hears of it, so ask
	$effect(() => {
		if (tutorial.step !== "upload") return;
		const timer = setInterval(() => void getTutorialState().refresh(), 3000);
		return () => clearInterval(timer);
	});

	// "Account" comes first in the bar
	const stepIndex = $derived(WELCOME_STEPS.indexOf(step) + 1);

	// each step starts with a suggestion, so "Continue" alone is enough
	let name = $derived(
		step === "organization"
			? tutorial.firstName
				? `${tutorial.firstName}'s Studio`
				: "My Studio"
			: step === "project"
				? "My First Project"
				: "Main Edit",
	);

	let busy = $state(false);
	let problem = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const value = name.trim();
		if (!value || busy) return;
		busy = true;
		problem = null;
		try {
			if (step === "organization") await createOrganization(value);
			else if (step === "project") {
				// createProject works in the active organization, which may be one the user was
				// invited into: the tutorial's project belongs in their own
				if (tutorial.organization) {
					const { error } = await authClient.organization.setActive({
						organizationId: tutorial.organization.id,
					});
					if (error) throw new Error(error.message ?? "Could not switch the organization.");
				}
				await createProject({ name: value });
			} else if (step === "timeline" && tutorial.project) {
				await createTimeline({ name: value, projectId: tutorial.project.id });
			}
			await getTutorialState().refresh();
		} catch (err) {
			problem = err instanceof Error ? err.message : "Something went wrong.";
		} finally {
			busy = false;
		}
	}

	async function skip() {
		await finishTutorial();
		await goto("/dashboard");
	}

	let uploadDialog = $state<UploadModal>();

	// The upload step has three pages, one thing at a time. An upload that is already there
	// (the plugin was quicker, or the page was reloaded) is what matters: straight to its page.
	// (a boolean of its own: the state is polled, and only a change may reset the page)
	const hasExport = $derived(!!tutorial.export);
	// ?show=export: back from the plugin's login, the next thing to see is the upload arriving
	let uploadPage = $derived(hasExport || page.url.searchParams.get("show") === "export" ? 3 : 1);

	// Plugins log in to the hosted PostPin unless told otherwise (dev builds: to this dev server)
	const serverUrl = $derived(dev || page.url.origin === HOSTED_ORIGIN ? null : page.url.origin);

	const exportHref = $derived(
		tutorial.project && tutorial.timeline && tutorial.export
			? `/projects/${tutorial.project.id}/timelines/${tutorial.timeline.id}/exports/${tutorial.export.id}`
			: null,
	);

	const FORMS = {
		organization: {
			title: "Create your organization",
			text: "An organization is your company or team. Projects, storage and members live in it, and you can invite people later.",
			label: "Organization name",
			placeholder: "Studio name",
		},
		project: {
			title: "Create your first project",
			text: "A project is one production: a film, a series, a commercial.",
			label: "Project name",
			placeholder: "My first film",
		},
		timeline: {
			title: "Add a timeline",
			text: "A timeline is the sequence you are editing, e.g. “Reel 1” or “Episode 3”. Every version you upload of it becomes an export, so reviewers always see the latest cut.",
			label: "Timeline name",
			placeholder: "Main Edit",
		},
	};
</script>

<PageMeta title="Welcome" description="Set up PostPin and upload your first export." />

{#snippet substep(number: number, title: string)}
	<h3 class="flex items-center gap-3 text-lg font-bold">
		<span
			class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-content"
		>
			{number}
		</span>
		{title}
	</h3>
{/snippet}

<div class="mx-auto max-w-3xl">
	<header class="space-y-2 text-center">
		<h1 class="text-3xl font-bold">Welcome to PostPin</h1>
		<p class="text-base-content/70">The review tool for your post-production.</p>
	</header>

	<div class="mt-8">
		<TutorialSteps current={stepIndex} />
	</div>

	<section class="card mt-8 bg-base-100 shadow-xl">
		<div class="card-body gap-6 p-6 sm:p-10">
			{#if step === "upload"}
				<h2 class="text-2xl font-bold">Upload your first export</h2>
				<InfoBox>
					PostPin works inside your editing software. The plugin renders your timeline, uploads it
					here and later brings every note back as a marker.
				</InfoBox>

				{#if tutorial.project && tutorial.timeline}
					{#if uploadPage === 1}
						<div class="space-y-4">
							{@render substep(1, "Get your plugin")}
							<a
								class="btn btn-primary max-sm:w-full"
								href={DOC_LINKS.downloads}
								target="_blank"
								rel="noopener noreferrer"
							>
								<ExternalLink size={16} />
								Plugin Download
							</a>
						</div>
					{:else if uploadPage === 2}
						<div class="space-y-4">
							{@render substep(2, "Upload to PostPin")}
							<div>
								<PluginGuide
									projectName={tutorial.project.name}
									timelineName={tutorial.timeline.name}
									{serverUrl}
								/>
							</div>
						</div>
					{:else}
						<div class="space-y-4">
							{@render substep(3, "Your first export")}
							<UploadWaiter export={tutorial.export} href={exportHref} />

							{#if !tutorial.export || tutorial.export.status === "FAILED"}
								<div class="flex flex-wrap items-center gap-3">
									<p class="text-sm text-base-content/70">No editing software at hand?</p>
									<button
										type="button"
										class="btn btn-outline btn-sm max-sm:w-full"
										onclick={() => uploadDialog?.open()}
									>
										<Upload size={16} />
										Upload a video file manually
									</button>
								</div>
							{/if}
						</div>
					{/if}

					<div class="flex gap-2">
						{#if uploadPage > 1}
							<button type="button" class="btn btn-ghost btn-lg" onclick={() => uploadPage--}>
								Back
							</button>
						{/if}
						{#if uploadPage < 3}
							<button
								type="button"
								class="btn flex-1 btn-lg btn-primary"
								onclick={() => uploadPage++}
							>
								Continue
							</button>
						{/if}
					</div>
					<UploadModal
						bind:this={uploadDialog}
						projectId={tutorial.project.id}
						timelineId={tutorial.timeline.id}
					/>
				{/if}
			{:else}
				{@const form = FORMS[step]}
				<h2 class="text-2xl font-bold">{form.title}</h2>
				<InfoBox>{form.text}</InfoBox>

				<form onsubmit={submit}>
					<label class="form-control w-full">
						<span class="label-text mb-2 block font-medium">{form.label}</span>
						<!-- svelte-ignore a11y_autofocus: the one thing to do on this page -->
						<input
							type="text"
							class="input-bordered input w-full input-lg"
							placeholder={form.placeholder}
							maxlength="100"
							autofocus
							disabled={busy}
							bind:value={name}
						/>
					</label>

					{#if problem}
						<div class="mt-4 alert text-sm alert-error" role="alert">{problem}</div>
					{/if}

					<button class="btn mt-6 w-full btn-lg btn-primary" disabled={busy || !name.trim()}>
						Continue
						{#if busy}<span class="loading loading-sm loading-spinner"></span>{/if}
					</button>
				</form>
			{/if}
		</div>
	</section>

	<p class="mt-6 text-center">
		<button type="button" class="btn btn-ghost btn-sm" onclick={skip}>Skip tutorial</button>
	</p>
</div>
