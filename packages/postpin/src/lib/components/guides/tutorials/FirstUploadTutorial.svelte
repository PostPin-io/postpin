<script lang="ts">
	// docs/guides/tutorials/first-upload.md: keep both in step.
	// From a fresh account to the first uploaded export. Where it is and what it made is
	// stored on every step, so a reload goes on where the user left off.
	import { untrack } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Upload from "@lucide/svelte/icons/upload";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import UploadModal from "#lib/components/exports/UploadModal.svelte";
	import { authClient } from "#lib/auth-client.ts";
	import { createOrganization } from "#lib/components/organizations/create-org.ts";
	import { createProject } from "#lib/components/projects/projects.remote.ts";
	import { createTimeline } from "#lib/components/timelines/timelines.remote.ts";
	import { uploads } from "#lib/upload/uploads.svelte.ts";
	import { GUIDE_STYLE } from "#lib/guides.ts";
	import TutorialShell from "../TutorialShell.svelte";
	import { showGuideFeedback } from "../guide-feedback.svelte.ts";
	import type { GuideProgressEntry } from "../guides.remote.ts";

	const STEPS = [
		"welcome",
		"create-organization",
		"create-project",
		"create-timeline",
		"upload-export",
		"processing",
	] as const;
	type Step = (typeof STEPS)[number];
	const LABELS: Record<Step, string> = {
		welcome: "Welcome",
		"create-organization": "Organization",
		"create-project": "Project",
		"create-timeline": "Timeline",
		"upload-export": "Upload",
		processing: "Processing",
	};

	interface Props {
		progress: GuideProgressEntry | undefined;
		/** In an organization already (joined one, or made it before the tutorial started) */
		hasOrganization: boolean;
		save: (status: GuideStatus, step?: string, context?: Record<string, string>) => Promise<void>;
	}
	let { progress, hasOrganization, save }: Props = $props();

	const session = authClient.useSession();
	const firstName = $derived($session.data?.user.name.split(" ")[0] ?? "");

	const style = GUIDE_STYLE.tutorial;

	// Taken over once: from here on this component is ahead of what is stored
	const stored = untrack(() => $state.snapshot(progress));
	let step = $state<Step>(
		STEPS.includes(stored?.step as Step) ? (stored!.step as Step) : "welcome",
	);
	// One organization is enough: who already has one goes on with the project
	$effect.pre(() => {
		if (step === "create-organization" && hasOrganization) step = "create-project";
	});
	let context = $state<Record<string, string>>({ ...(stored?.context ?? {}) });

	async function moveTo(next: Step, made: Record<string, string> = {}) {
		context = { ...context, ...made };
		step = next;
		await save(GuideStatus.STARTED, next, context);
	}

	let name = $state("");
	$effect.pre(() => {
		// each form starts with a suggestion, so "Continue" alone is enough
		if (step === "create-organization") name = firstName ? `${firstName}'s Studio` : "My Studio";
		else if (step === "create-project") name = "My First Project";
		else if (step === "create-timeline") name = "Main Edit";
	});

	let busy = $state(false);
	let problem = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const value = name.trim();
		if (!value || busy) return;
		busy = true;
		problem = null;
		try {
			if (step === "create-organization") {
				// also makes it the active one, where the project goes
				await createOrganization(value);
				showGuideFeedback("Organization created", "tutorial");
				await moveTo("create-project");
			} else if (step === "create-project") {
				const { id } = await createProject({ name: value });
				await moveTo("create-timeline", { projectId: id });
			} else if (step === "create-timeline" && context.projectId) {
				const { id } = await createTimeline({ name: value, projectId: context.projectId });
				await moveTo("upload-export", { timelineId: id });
			}
		} catch (err) {
			problem = err instanceof Error ? err.message : "Something went wrong.";
		} finally {
			busy = false;
		}
	}

	let uploadDialog = $state<UploadModal>();

	// The upload runs in the tab's upload manager; after a reload it isn't there any more, and
	// the export page knows better how far it got
	const upload = $derived(context.exportId ? uploads.uploads[context.exportId] : undefined);
	const percent = $derived(
		upload ? Math.floor((upload.loaded / Math.max(1, upload.size)) * 100) : null,
	);
	const uploadFailed = $derived(upload?.status === "interrupted" || upload?.status === "cancelled");
	const uploadDone = $derived(!upload || upload.status === "done");

	async function openExport() {
		const { projectId, timelineId, exportId } = context;
		await save(GuideStatus.COMPLETED);
		if (projectId && timelineId && exportId) {
			await goto(
				resolve("/(root)/projects/[project]/timelines/[timeline]/exports/[export]", {
					project: projectId,
					timeline: timelineId,
					export: exportId,
				}),
			);
		}
	}

	const FORMS = {
		"create-organization": {
			title: "Create your organization",
			text: "An organization is your company or team. Projects, storage and members live in it, and you can invite people later.",
			label: "Organization name",
		},
		"create-project": {
			title: "Create your first project",
			text: "A project is one production: a film, a series, a commercial.",
			label: "Project name",
		},
		"create-timeline": {
			title: "Add a timeline",
			text: "A timeline is the sequence you are editing, e.g. “Reel 1” or “Episode 3”. Every version you upload of it becomes an export, so reviewers always see the latest cut.",
			label: "Timeline name",
		},
	} as const;
</script>

<TutorialShell
	guideId="first-upload"
	steps={STEPS.map((s) => LABELS[s])}
	current={STEPS.indexOf(step)}
	onskip={() => save(GuideStatus.SKIPPED)}
>
	{#if step === "welcome"}
		<div class="flex flex-col items-center gap-3 text-center">
			<CircleCheck class="size-14 text-success" />
			<h2 class="text-2xl font-bold">Welcome to PostPin</h2>
			<p class="text-base-content/70">
				Your account is ready. Let's set up your workspace and upload your first export, so your
				reviewers have something to watch.
			</p>
		</div>
		<button
			type="button"
			class="btn btn-lg {style.button}"
			onclick={() => moveTo(hasOrganization ? "create-project" : "create-organization")}
		>
			Let's go
			<ArrowRight size={18} />
		</button>
	{:else if step === "create-organization" || step === "create-project" || step === "create-timeline"}
		{@const form = FORMS[step]}
		<h2 class="text-2xl font-bold">{form.title}</h2>
		<p class="text-base-content/70">{form.text}</p>
		<form onsubmit={submit}>
			<label class="form-control w-full">
				<span class="label-text mb-2 block font-medium">{form.label}</span>
				<!-- autofocus: the one thing to do in this step -->
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					class="input-bordered input w-full input-lg"
					maxlength="100"
					autofocus
					disabled={busy}
					bind:value={name}
				/>
			</label>
			{#if problem}
				<div class="mt-4 alert text-sm alert-error" role="alert">{problem}</div>
			{/if}
			<button class="btn mt-6 w-full btn-lg {style.button}" disabled={busy || !name.trim()}>
				Continue
				{#if busy}<span class="loading loading-sm loading-spinner"></span>{/if}
			</button>
		</form>
	{:else if step === "upload-export"}
		<h2 class="text-2xl font-bold">Upload your first export</h2>
		<p class="text-base-content/70">
			An export is a render of your timeline. Choose a video file; PostPin reads its frame rate and
			start timecode, so every marker lands on the right frame.
		</p>
		<button type="button" class="btn btn-lg {style.button}" onclick={() => uploadDialog?.open()}>
			<Upload size={18} />
			Choose a video
		</button>
		{#if context.projectId && context.timelineId}
			<UploadModal
				bind:this={uploadDialog}
				projectId={context.projectId}
				timelineId={context.timelineId}
				onstarted={(exportId) => moveTo("processing", { exportId })}
			/>
		{/if}
	{:else}
		<div class="flex flex-col items-center gap-3 text-center" role="status" aria-live="polite">
			{#if uploadFailed}
				<h2 class="text-2xl font-bold text-error">The upload stopped</h2>
				<p class="text-base-content/70">{upload?.error ?? "Try it once more."}</p>
			{:else if uploadDone}
				<CircleCheck class="size-14 text-success" />
				<h2 class="text-2xl font-bold">Export uploaded, processing has started</h2>
				<p class="text-base-content/70">
					PostPin is preparing it for playback. You can open it right away; it plays as soon as it's
					ready.
				</p>
			{:else}
				<span class="loading loading-lg loading-spinner {style.text}"></span>
				<h2 class="text-2xl font-bold">Uploading… {percent ?? 0}%</h2>
				<p class="text-base-content/70">
					Keep this tab open. You can already open the export, the upload keeps running.
				</p>
			{/if}
		</div>
		{#if uploadFailed}
			<button
				type="button"
				class="btn btn-lg {style.button}"
				onclick={() => moveTo("upload-export")}
			>
				Upload again
			</button>
		{:else}
			<!-- also during the upload: it keeps running, and the export page shows its progress -->
			<button type="button" class="btn btn-lg {style.button}" onclick={openExport}>
				Open your export
				<ArrowRight size={18} />
			</button>
		{/if}
	{/if}
</TutorialShell>
