<script lang="ts">
	// docs/guides/tutorials/install-desktop.md: keep both in step. Steps, sign-in and ending come
	// from InstallTutorial; this is what is special about PostPin Desktop. It works with several
	// programs, each gets its variant here (the program switch), not a new tutorial.
	import { untrack } from "svelte";
	import type { GuideStatus } from "@postpin-io/shared/db/enums";
	import type { DesktopOs } from "#lib/downloads.ts";
	import { guideState } from "../guide-state.svelte.ts";
	import type { GuideProgressEntry } from "../guides.remote.ts";
	import InstallTutorial from "./InstallTutorial.svelte";

	interface Props {
		progress: GuideProgressEntry | undefined;
		save: (status: GuideStatus, step?: string, context?: Record<string, string>) => Promise<void>;
	}
	let { progress, save }: Props = $props();

	const PROGRAMS = [
		{ value: "pro-tools", label: "Pro Tools" },
		{ value: "filmcraft", label: "FilmCraft" },
	] as const;
	type Program = (typeof PROGRAMS)[number]["value"];
	const isProgram = (value: string | undefined): value is Program =>
		PROGRAMS.some((p) => p.value === value);

	// The answer to the plugin question first, then where the tutorial left off
	const initial = untrack(() =>
		[guideState.requestedWith?.program, progress?.context?.program].find(isProgram),
	);
	let program = $state<string>(initial ?? "pro-tools");
</script>

{#snippet download()}
	<h2 class="text-2xl font-bold">Get PostPin Desktop</h2>
	{#if program === "filmcraft"}
		<p class="text-base-content/70">
			PostPin Desktop connects PostPin to FilmCraft: it uploads exports of your sequence and brings
			your reviewers' markers back onto it.
		</p>
		<div class="alert text-sm alert-info" role="note">
			It needs <strong>FilmCraft</strong> installed in its usual place on this computer.
		</div>
	{:else}
		<p class="text-base-content/70">
			PostPin Desktop connects PostPin to Pro Tools: it uploads bounces of your session and brings
			your reviewers' markers back as memory locations.
		</p>
		<div class="alert text-sm alert-info" role="note">
			It needs <strong>Pro Tools 2025.10 or newer</strong>.
		</div>
	{/if}
{/snippet}

<!-- Windows only: the macOS app is signed and notarized -->
{#snippet security(file: string)}
	<h2 class="text-2xl font-bold">Open the installer</h2>
	<p class="text-base-content/70">
		Open <code class="text-sm break-all">{file}</code> from your Downloads. Our Windows installer
		isn't signed yet, so Windows stops it first with <strong>“Windows protected your PC”</strong>.
	</p>
	<ol class="list-decimal space-y-2 pl-6">
		<li>Click <strong>More info</strong>.</li>
		<li>
			Check that the app is <code class="text-sm break-all">{file}</code>, then click
			<strong>Run anyway</strong>.
		</li>
	</ol>
{/snippet}

{#snippet install(file: string, os: DesktopOs)}
	<h2 class="text-2xl font-bold">Install PostPin Desktop</h2>
	{#if os === "mac"}
		<ol class="list-decimal space-y-2 pl-6">
			<li>Open <code class="text-sm break-all">{file}</code> from your Downloads.</li>
			<li>Drag <strong>PostPin Desktop</strong> into the <strong>Applications</strong> folder.</li>
			<li>
				Open it from Applications. macOS asks once whether to open an app from the internet: click
				<strong>Open</strong>.
			</li>
		</ol>
	{:else}
		<p class="text-base-content/70">
			The installer runs by itself, without further questions, and starts PostPin Desktop when it's
			done.
		</p>
	{/if}
	<p class="text-sm text-base-content/70">PostPin Desktop updates itself from then on.</p>
{/snippet}

{#snippet open()}
	{#if program === "filmcraft"}
		<h2 class="text-2xl font-bold">Quit FilmCraft</h2>
		<p class="text-base-content/70">
			FilmCraft only lets PostPin in when PostPin Desktop starts it. You pick FilmCraft in PostPin
			Desktop once you're signed in, and it opens FilmCraft for you.
		</p>
		<ol class="list-decimal space-y-2 pl-6">
			<li>Quit <strong>FilmCraft</strong> if it's open.</li>
			<li>Keep <strong>PostPin Desktop</strong> open.</li>
		</ol>
	{:else}
		<h2 class="text-2xl font-bold">Open Pro Tools</h2>
		<ol class="list-decimal space-y-2 pl-6">
			<li>Start <strong>Pro Tools</strong> and open a session.</li>
			<li>Keep <strong>PostPin Desktop</strong> open next to it.</li>
		</ol>
		<details class="collapse-arrow collapse bg-base-200">
			<summary class="collapse-title text-sm font-semibold"
				>PostPin Desktop can't reach Pro Tools?</summary
			>
			<div class="collapse-content space-y-2 text-sm text-base-content/70">
				<p>
					“Pro Tools is not running, or its scripting interface is disabled”: make sure Pro Tools is
					running with a session open, then try again.
				</p>
				<p>
					“Pro Tools 2025.10 or newer is required”: update Pro Tools, PostPin uses its scripting
					interface, which older versions don't have in full.
				</p>
			</div>
		</details>
	{/if}
{/snippet}

{#snippet done()}
	<h2 class="text-2xl font-bold">PostPin Desktop is connected</h2>
	{#if program === "filmcraft"}
		<p class="text-base-content/70">
			In PostPin Desktop, choose <strong>FilmCraft</strong> under <strong>Program</strong>. It opens
			FilmCraft: open your project and a sequence, then upload and pull markers from there.
		</p>
		<details class="collapse-arrow collapse bg-base-200 text-left">
			<summary class="collapse-title text-sm font-semibold"
				>PostPin Desktop can't reach FilmCraft?</summary
			>
			<div class="collapse-content space-y-2 text-sm text-base-content/70">
				<p>
					“FilmCraft is running without remote control”: quit FilmCraft, then PostPin Desktop starts
					it again.
				</p>
				<p>“FilmCraft isn't installed”: install FilmCraft in its usual place, then try again.</p>
			</div>
		</details>
	{:else}
		<p class="text-base-content/70">
			You can now create projects and timelines from PostPin Desktop, upload bounces of your Pro
			Tools session, and pull your reviewers' markers back onto it.
		</p>
	{/if}
{/snippet}

<InstallTutorial
	guideId="install-desktop"
	plugin="desktop"
	clientId="io.postpin.desktop"
	loginWhere="PostPin Desktop"
	app="PostPin Desktop"
	securityOn={["windows"]}
	programs={PROGRAMS}
	bind:program
	openLabel={program === "filmcraft" ? "Quit FilmCraft" : "Open Pro Tools"}
	connectedFeedback="PostPin Desktop connected"
	{download}
	{security}
	{install}
	{open}
	{done}
	{progress}
	{save}
/>
