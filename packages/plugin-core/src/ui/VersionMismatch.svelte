<script lang="ts">
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";
	import LogOut from "@lucide/svelte/icons/log-out";
	import Download from "@lucide/svelte/icons/download";
	import { releaseDownloadUrl } from "@postpin-io/shared/api-version";
	import type { AvailableUpdate } from "../bridge";
	import { errorMessage } from "../errors";
	import DragBar from "./DragBar.svelte";
	import { getBridges } from "./context";

	interface Props {
		pluginApiVersion: number | string;
		serverApiVersion: number;
		/** the server's release, its plugins speak its API version */
		serverRelease?: string | null;
	}

	let { pluginApiVersion, serverApiVersion, serverRelease = null }: Props = $props();

	const { host } = getBridges();

	// a version that isn't a number is from some other client, treat the plugin as the outdated side
	const pluginOlder = $derived(
		typeof pluginApiVersion !== "number" || pluginApiVersion < serverApiVersion,
	);
	// works both ways: the plugins of the server's release always match it
	const downloadUrl = $derived(releaseDownloadUrl(serverRelease));

	type UpdateState =
		| { status: "checking" }
		| { status: "none" }
		| { status: "available"; update: AvailableUpdate }
		| { status: "downloading"; update: AvailableUpdate; fraction: number }
		| { status: "ready"; update: AvailableUpdate }
		| { status: "failed"; error: string };
	let updateState = $state<UpdateState>({ status: "none" });

	// Self-updating hosts update in place, but only to a release that speaks the server's API version:
	// a server pinned to an older release needs the plugins of that release instead (downloadUrl)
	$effect(() => {
		const { updater } = host;
		if (!updater || !pluginOlder) return;
		updateState = { status: "checking" };
		updater
			.check()
			.then((update) => {
				updateState =
					update?.apiVersion === serverApiVersion
						? { status: "available", update }
						: { status: "none" };
			})
			.catch(() => (updateState = { status: "none" }));
	});

	async function downloadUpdate(update: AvailableUpdate) {
		updateState = { status: "downloading", update, fraction: 0 };
		try {
			await host.updater!.download((fraction) => {
				updateState = { status: "downloading", update, fraction };
			});
			updateState = { status: "ready", update };
		} catch (error) {
			updateState = { status: "failed", error: errorMessage(error) };
		}
	}
</script>

<main class="flex h-screen w-screen items-center justify-center p-4">
	<DragBar />
	<div
		role="alert"
		class="flex w-96 max-w-full flex-col items-center gap-4 rounded-lg bg-base-100 p-8 text-center shadow-lg"
	>
		<TriangleAlert class="size-10 text-warning" />
		<h2 class="font-bold">{pluginOlder ? "Plugin update required" : "Server update required"}</h2>
		<p class="text-sm text-base-content/70">
			{#if pluginOlder}
				This plugin is older than your PostPin server. Install the plugin that matches the server to
				keep working.
			{:else}
				This plugin is newer than your PostPin server. Ask your administrator to update the server,
				or install the plugin that matches it.
			{/if}
		</p>

		{#if updateState.status === "checking"}
			<span class="loading loading-sm loading-spinner"></span>
		{:else if updateState.status === "available"}
			{@const update = updateState.update}
			<button type="button" class="btn btn-sm btn-primary" onclick={() => downloadUpdate(update)}>
				<Download size={14} /> Update to {update.version}
			</button>
		{:else if updateState.status === "downloading"}
			<div class="flex w-full flex-col gap-1">
				<progress class="progress progress-primary w-full" value={updateState.fraction} max="1"
				></progress>
				<span class="text-xs text-base-content/60">
					Downloading {updateState.update.version}… {Math.round(updateState.fraction * 100)} %
				</span>
			</div>
		{:else if updateState.status === "ready"}
			<button type="button" class="btn btn-sm btn-primary" onclick={() => host.updater!.install()}>
				<RefreshCw size={14} /> Restart to update
			</button>
		{:else}
			{#if updateState.status === "failed"}
				<p class="text-xs text-error">The update failed: {updateState.error}</p>
			{/if}
			{#if downloadUrl}
				<button
					type="button"
					class="btn btn-sm btn-primary"
					onclick={() => host.openInBrowser(downloadUrl)}
				>
					<Download size={14} /> Download plugin for PostPin {serverRelease}
				</button>
			{/if}
		{/if}

		<p class="font-mono text-xs text-base-content/50">
			Plugin API {pluginApiVersion} · Server API {serverApiVersion}{serverRelease
				? ` (PostPin ${serverRelease})`
				: ""}
		</p>
		<div class="flex flex-wrap justify-center gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => location.reload()}>
				<RefreshCw size={14} /> Try again
			</button>
			<!-- another server may speak this plugin's version -->
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => host.logout()}>
				<LogOut size={14} /> Log out
			</button>
		</div>
	</div>
</main>
