<script lang="ts">
	// docs/guides/tutorials/install-premiere.md: keep both in step. Steps, sign-in and ending come
	// from InstallTutorial; this is what is special about Premiere Pro.
	import type { GuideStatus } from "@postpin-io/shared/db/enums";
	import type { DesktopOs } from "#lib/downloads.ts";
	import type { GuideProgressEntry } from "../guides.remote.ts";
	import InstallTutorial from "./InstallTutorial.svelte";

	interface Props {
		progress: GuideProgressEntry | undefined;
		save: (status: GuideStatus, step?: string, context?: Record<string, string>) => Promise<void>;
	}
	let { progress, save }: Props = $props();

	// When double-clicking doesn't install: Adobe's own installer, from the command line
	const UPIA: Record<DesktopOs, (file: string) => string> = {
		mac: (file) =>
			`"/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install ~/Downloads/${file}`,
		windows: (file) =>
			`"C:\\Program Files\\Common Files\\Adobe\\Adobe Desktop Common\\RemoteComponents\\UPI\\UnifiedPluginInstallerAgent\\UnifiedPluginInstallerAgent.exe" /install "%USERPROFILE%\\Downloads\\${file}"`,
	};
	const TERMINAL: Record<DesktopOs, string> = { mac: "Terminal", windows: "Command Prompt" };
</script>

{#snippet download()}
	<h2 class="text-2xl font-bold">Get the plugin for Premiere Pro</h2>
	<p class="text-base-content/70">
		The PostPin panel uploads renders of your sequence and brings your reviewers' markers back onto
		it, right inside Premiere Pro.
	</p>
	<div class="alert text-sm alert-info" role="note">
		It needs <strong>Premiere Pro 26.2 or newer</strong> and the Creative Cloud desktop app, signed in.
	</div>
{/snippet}

<!-- Creative Cloud warns on both systems: the plugin doesn't come from the Adobe Marketplace -->
{#snippet security(file: string)}
	<h2 class="text-2xl font-bold">Open the plugin</h2>
	<ol class="list-decimal space-y-2 pl-6">
		<li>Double-click <code class="text-sm break-all">{file}</code> in your Downloads.</li>
		<li>
			Creative Cloud opens and warns that the plugin doesn't come from the Adobe Marketplace. That's
			expected: PostPin is installed directly. Click <strong>Install</strong>.
		</li>
	</ol>
{/snippet}

{#snippet install(file: string, os: DesktopOs)}
	<h2 class="text-2xl font-bold">Install the plugin</h2>
	<p class="text-base-content/70">
		Creative Cloud installs it and confirms that PostPin is installed. Updating later works the same
		way: double-click the new file.
	</p>
	<details class="collapse-arrow collapse bg-base-200">
		<summary class="collapse-title text-sm font-semibold">Nothing happened?</summary>
		<div class="collapse-content space-y-2 text-sm text-base-content/70">
			<p>
				Make sure the Creative Cloud desktop app is running and signed in, then double-click the
				file again.
			</p>
			<p>Still nothing: install it with Adobe's installer. Paste this into {TERMINAL[os]}:</p>
			<code class="block rounded bg-base-100 p-2 text-xs break-all select-all"
				>{UPIA[os](file)}</code
			>
		</div>
	</details>
{/snippet}

{#snippet open()}
	<h2 class="text-2xl font-bold">Open PostPin in Premiere Pro</h2>
	<ol class="list-decimal space-y-2 pl-6">
		<li>Start <strong>Premiere Pro</strong> (restart it if it was running) and open a project.</li>
		<li>Choose <strong>Window → UXP Plugins → PostPin</strong>.</li>
	</ol>
	<details class="collapse-arrow collapse bg-base-200">
		<summary class="collapse-title text-sm font-semibold">PostPin isn't in the menu?</summary>
		<div class="collapse-content space-y-2 text-sm text-base-content/70">
			<p>
				Check the version under <strong>Help → About Premiere Pro</strong>: it needs 26.2 or newer.
			</p>
			<p>
				PostPin must be listed among your installed plugins in the Creative Cloud app. If it isn't,
				install it again.
			</p>
		</div>
	</details>
{/snippet}

{#snippet done()}
	<h2 class="text-2xl font-bold">Premiere Pro is connected</h2>
	<p class="text-base-content/70">
		From the PostPin panel you can now create projects and timelines, render and upload your
		sequence, and pull your reviewers' markers back onto it.
	</p>
{/snippet}

<InstallTutorial
	guideId="install-premiere"
	plugin="premiere"
	clientId="io.postpin.plugin.premiere"
	loginWhere="the PostPin panel in Premiere Pro"
	app="Premiere Pro"
	securityOn={["mac", "windows"]}
	openLabel="Open in Premiere"
	connectedFeedback="Plugin connected"
	{download}
	{security}
	{install}
	{open}
	{done}
	{progress}
	{save}
/>
