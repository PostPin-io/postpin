<script lang="ts">
	// The frame of every install tutorial (docs/guides/tutorials/plugin-workflow.md, "Install
	// tutorials"): same steps, OS switch, download, sign-in and ending for every plugin; the
	// plugin brings the texts. Installing happens outside the browser, so those steps go on with
	// "Next". Signing in the plugin is what the web app sees: it finishes the tutorial from any step.
	import { untrack, type Snippet } from "svelte";
	import { dev, version } from "$app/env";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Download from "@lucide/svelte/icons/download";
	import { GuideStatus } from "@postpin-io/shared/db/enums";
	import type { DEVICE_CLIENTS } from "#lib/device-clients.ts";
	import {
		OS_LABEL,
		detectOs,
		isHostedServer,
		pluginInstaller,
		type DesktopOs,
		type Plugin,
	} from "#lib/downloads.ts";
	import { GUIDE_STYLE } from "#lib/guides.ts";
	import { INSTALL_STEPS, installStepsFor, type InstallStep } from "./install-steps.ts";
	import TutorialShell from "../TutorialShell.svelte";
	import { showGuideFeedback } from "../guide-feedback.svelte.ts";
	import { getPluginSignIn, type GuideProgressEntry } from "../guides.remote.ts";

	interface Props {
		guideId: "install-resolve" | "install-premiere" | "install-desktop";
		plugin: Plugin;
		/** Its device-flow client: a session of it means "signed in" */
		clientId: keyof typeof DEVICE_CLIENTS;
		/** Where the user signs in, in "In …, click Login" */
		loginWhere: string;
		/** The app showing the sign-in code, in "matches the one in …" */
		app: string;
		/** The OSes with a security prompt when the installer is opened */
		securityOn: readonly DesktopOs[];
		/** Step bar label of open-in-nle, e.g. "Open in Resolve" */
		openLabel: string;
		/** After connect, without the "✓" */
		connectedFeedback: string;
		/** Title, what the plugin does, requirements */
		download: Snippet<[DesktopOs]>;
		/** Each gets the installer's file name and the OS */
		security: Snippet<[string, DesktopOs]>;
		install: Snippet<[string, DesktopOs]>;
		open: Snippet<[DesktopOs]>;
		/** Title and text of the completion screen */
		done: Snippet;
		progress: GuideProgressEntry | undefined;
		save: (status: GuideStatus, step?: string, context?: Record<string, string>) => Promise<void>;
	}
	let {
		guideId,
		plugin,
		clientId,
		loginWhere,
		app,
		securityOn,
		openLabel,
		connectedFeedback,
		download,
		security,
		install,
		open,
		done,
		progress,
		save,
	}: Props = $props();

	const style = GUIDE_STYLE.tutorial;
	const LABELS: Record<InstallStep, string> = $derived({
		download: "Download",
		"os-security": "Security prompt",
		install: "Install",
		"open-in-nle": openLabel,
		connect: "Sign in",
		done: "Done",
	});

	const signInQuery = $derived(getPluginSignIn(clientId));
	const lastSignIn = $derived(await signInQuery);

	// Taken over once: from here on this component is ahead of what is stored
	const stored = untrack(() => $state.snapshot(progress));
	const storedOs = stored?.context?.os;
	let os = $state<DesktopOs>(storedOs === "windows" || storedOs === "mac" ? storedOs : detectOs());
	let step = $state<InstallStep>(
		INSTALL_STEPS.includes(stored?.step as InstallStep)
			? (stored!.step as InstallStep)
			: "download",
	);
	// The sign-in there was before the tutorial: only a newer one means "just signed in". Compared
	// as stored, so the server's clock is the only one that counts.
	const signInBefore = untrack(() => stored?.context?.signInBefore ?? lastSignIn ?? "");

	const steps = $derived(installStepsFor(os, securityOn));
	$effect.pre(() => {
		// switched to an OS without the security prompt while on it
		if (!steps.includes(step)) step = "install";
	});

	const context = () => ({ os, signInBefore });

	async function moveTo(next: InstallStep) {
		step = next;
		await save(GuideStatus.STARTED, next, context());
	}

	function chooseOs(next: DesktopOs) {
		os = next;
		void save(GuideStatus.STARTED, steps.includes(step) ? step : "install", context());
	}

	const offset = (by: number) => steps[steps.indexOf(step) + by]!;

	// First visit: store where it started, so a reload goes on there
	$effect(() => {
		if (!stored) untrack(() => save(GuideStatus.STARTED, step, context()));
	});

	// Signed in: done. Before the sign-in step only a new sign-in counts; on it, also one from
	// before (a plugin that is still signed in after a reinstall doesn't ask again).
	$effect(() => {
		if (step === "done" || !lastSignIn) return;
		if (step === "connect" || lastSignIn !== signInBefore) {
			showGuideFeedback(connectedFeedback, "tutorial");
			void moveTo("done");
		}
	});

	// The sign-in happens in the plugin and another tab: look for it every few seconds
	$effect(() => {
		if (step === "done") return;
		const query = signInQuery;
		const interval = setInterval(() => {
			if (!document.hidden) void query.refresh();
		}, 3000);
		return () => clearInterval(interval);
	});

	const installer = $derived(pluginInstaller(plugin, os, version));
	const otherOs = $derived<DesktopOs>(os === "mac" ? "windows" : "mac");
	// Premiere has one file for both: no need to offer the other one
	const sameForBoth = $derived(pluginInstaller(plugin, otherOs, version).file === installer.file);
	const fileName = $derived(installer.file ?? "the installer");
	const hosted = $derived(isHostedServer(page.url.origin, dev));

	function downloaded() {
		// the fallback opens the downloads page, nothing has started yet there
		if (installer.file) showGuideFeedback("Download started", "tutorial");
		void moveTo(offset(1));
	}
</script>

{#snippet osSwitch()}
	<div class="flex flex-wrap items-center justify-end gap-2 text-sm">
		<span class="text-base-content/60">Installing on</span>
		<div class="join" role="radiogroup" aria-label="Operating system">
			{#each ["mac", "windows"] as const as value (value)}
				<button
					type="button"
					role="radio"
					aria-checked={os === value}
					class="btn join-item btn-sm {os === value ? style.button : ''}"
					onclick={() => chooseOs(value)}
				>
					{OS_LABEL[value]}
				</button>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet back()}
	<button type="button" class="btn btn-ghost" onclick={() => moveTo(offset(-1))}>
		<ArrowLeft size={18} />
		Back
	</button>
{/snippet}

{#snippet nav()}
	<div class="flex flex-wrap items-center justify-between gap-3">
		{@render back()}
		<button type="button" class="btn btn-lg {style.button}" onclick={() => moveTo(offset(1))}>
			Next
			<ArrowRight size={18} />
		</button>
	</div>
{/snippet}

<TutorialShell
	{guideId}
	steps={steps.map((s) => LABELS[s])}
	current={steps.indexOf(step)}
	onskip={() => save(GuideStatus.SKIPPED)}
>
	{#if step !== "done"}
		{@render osSwitch()}
	{/if}

	{#if step === "download"}
		{@render download(os)}
		<a
			class="btn btn-lg {style.button}"
			href={installer.url}
			target={installer.file ? undefined : "_blank"}
			rel="noopener noreferrer"
			onclick={downloaded}
		>
			<Download size={18} />
			{sameForBoth ? "Download the plugin" : `Download for ${OS_LABEL[os]}`}
		</a>
		<div class="flex flex-wrap justify-between gap-2 text-sm">
			{#if sameForBoth}
				<span class="text-base-content/60">The same file for macOS and Windows.</span>
			{:else}
				<button type="button" class="link link-hover" onclick={() => chooseOs(otherOs)}>
					Need it for {OS_LABEL[otherOs]}?
				</button>
			{/if}
			<button type="button" class="link link-hover" onclick={() => moveTo("open-in-nle")}>
				Already installed
			</button>
		</div>
	{:else if step === "os-security"}
		{@render security(fileName, os)}
		{@render nav()}
	{:else if step === "install"}
		{@render install(fileName, os)}
		{@render nav()}
	{:else if step === "open-in-nle"}
		{@render open(os)}
		{@render nav()}
	{:else if step === "connect"}
		<h2 class="text-2xl font-bold">Sign in</h2>
		<ol class="list-decimal space-y-2 pl-6">
			<li>In {loginWhere}, click <strong>Login</strong>.</li>
			{#if hosted}
				<li>Leave <strong>Use hosted PostPin server</strong> switched on.</li>
			{:else}
				<li>
					Switch off <strong>Use hosted PostPin server</strong> and enter this server:
					<code class="text-sm break-all">{page.url.origin}</code>
				</li>
			{/if}
			<li>
				Your browser opens a page with a code. Check that it matches the one in {app} and approve it.
			</li>
		</ol>
		<div class="flex items-center gap-3 text-base-content/70" role="status" aria-live="polite">
			<span class="loading loading-sm loading-spinner {style.text}"></span>
			Waiting for the sign-in…
		</div>
		<p class="text-sm text-base-content/70">
			No browser opened? Go to
			<a class="link" href={resolve("/auth/device")} target="_blank" rel="noopener noreferrer"
				>the sign-in page</a
			>
			and enter the code shown in {app}.
		</p>
		<div>{@render back()}</div>
	{:else}
		<div class="flex flex-col items-center gap-3 text-center">
			<CircleCheck class="size-14 text-success" />
			{@render done()}
			<p class="text-sm text-base-content/60">
				More tutorials and tours are under PostPin Guides in the account menu.
			</p>
		</div>
		<button
			type="button"
			class="btn btn-lg {style.button}"
			onclick={() => save(GuideStatus.COMPLETED)}
		>
			Done
		</button>
	{/if}
</TutorialShell>
