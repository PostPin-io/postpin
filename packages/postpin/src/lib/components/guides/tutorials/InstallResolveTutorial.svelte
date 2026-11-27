<script lang="ts">
	// docs/guides/tutorials/install-resolve.md: keep both in step. Steps, sign-in and ending come
	// from InstallTutorial; this is what is special about Resolve.
	import type { GuideStatus } from "@postpin-io/shared/db/enums";
	import type { DesktopOs } from "#lib/downloads.ts";
	import type { GuideProgressEntry } from "../guides.remote.ts";
	import InstallTutorial from "./InstallTutorial.svelte";

	interface Props {
		progress: GuideProgressEntry | undefined;
		save: (status: GuideStatus, step?: string, context?: Record<string, string>) => Promise<void>;
	}
	let { progress, save }: Props = $props();

	const PLUGIN_FOLDER: Record<DesktopOs, string> = {
		mac: "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/io.postpin.plugin.resolve",
		windows:
			"C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Workflow Integration Plugins\\io.postpin.plugin.resolve",
	};
</script>

{#snippet download()}
	<h2 class="text-2xl font-bold">Get the plugin for DaVinci Resolve</h2>
	<p class="text-base-content/70">
		The PostPin plugin uploads renders of your timeline and brings your reviewers' markers back onto
		it, right inside Resolve.
	</p>
	<div class="alert text-sm alert-info" role="note">
		It needs <strong>DaVinci Resolve Studio 20.1</strong> or newer: the free version of Resolve has no
		Workflow Integrations.
	</div>
	<p class="text-sm text-base-content/70">
		Quit DaVinci Resolve before you install: it loads plugins only when it starts.
	</p>
{/snippet}

<!-- Windows only: the macOS package is signed and notarized -->
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
	<h2 class="text-2xl font-bold">Install the plugin</h2>
	{#if os === "mac"}
		<ol class="list-decimal space-y-2 pl-6">
			<li>Open <code class="text-sm break-all">{file}</code> from your Downloads.</li>
			<li>
				Click through the installer with <strong>Continue</strong> and <strong>Install</strong>.
			</li>
			<li>Enter your Mac password when asked: the plugin goes into Resolve's system folder.</li>
		</ol>
	{:else}
		<ol class="list-decimal space-y-2 pl-6">
			<li>
				Windows asks whether the installer may make changes to your device: click <strong
					>Yes</strong
				>.
			</li>
			<li>
				Wait until it says <strong>“PostPin for DaVinci Resolve is installed”</strong>, then click
				<strong>Finish</strong>.
			</li>
		</ol>
	{/if}
	<p class="text-sm text-base-content/70">
		Updating later works the same way: the installer replaces the old version.
	</p>
{/snippet}

{#snippet open(os: DesktopOs)}
	<h2 class="text-2xl font-bold">Open PostPin in Resolve</h2>
	<ol class="list-decimal space-y-2 pl-6">
		<li>
			Start <strong>DaVinci Resolve Studio</strong> (restart it if it was running) and open a project.
		</li>
		<li>Choose <strong>Workspace → Workflow Integrations → PostPin</strong>.</li>
	</ol>
	<details class="collapse-arrow collapse bg-base-200">
		<summary class="collapse-title text-sm font-semibold">PostPin isn't in the menu?</summary>
		<div class="collapse-content space-y-2 text-sm text-base-content/70">
			<p>
				Make sure it is DaVinci Resolve <strong>Studio</strong>: the free version has no Workflow
				Integrations menu.
			</p>
			<p>Quit Resolve completely and start it again: it loads plugins only on start.</p>
			<p>The installer puts the plugin here; if the folder is missing, install it again:</p>
			<code class="block rounded bg-base-100 p-2 text-xs break-all">{PLUGIN_FOLDER[os]}</code>
		</div>
	</details>
{/snippet}

{#snippet done()}
	<h2 class="text-2xl font-bold">DaVinci Resolve is connected</h2>
	<p class="text-base-content/70">
		From the PostPin panel you can now create projects and timelines, render and upload your
		timeline, and pull your reviewers' markers back onto it.
	</p>
{/snippet}

<InstallTutorial
	guideId="install-resolve"
	plugin="resolve"
	clientId="io.postpin.plugin.resolve"
	loginWhere="the PostPin panel in Resolve"
	app="Resolve"
	securityOn={["windows"]}
	openLabel="Open in Resolve"
	connectedFeedback="Plugin connected"
	{download}
	{security}
	{install}
	{open}
	{done}
	{progress}
	{save}
/>
