<script lang="ts">
	import type { Snippet } from "svelte";
	import HostLogo from "./HostLogo.svelte";
	import { hostInfo } from "./hosts";

	interface Props {
		// Capabilities.hostName, null until the NLE has answered once
		hostName: string | null;
		status: "connecting" | "connected" | "disconnected";
		// why the NLE isn't reachable, set while disconnected
		error: string | null;
		onRetry: () => void;
		// name of the timeline open in the NLE, null when none is open
		timelineName: string | null;
		// name of the project open in the NLE, null when none is open
		projectName: string | null;
		disabled: boolean;
		onClearMarkers: () => void;
		// host app content, e.g. the connected NLE picker in PostPin Desktop
		header?: Snippet;
		thumbnailDataUrl?: string;
	}

	let {
		hostName,
		status,
		error,
		onRetry,
		timelineName,
		projectName,
		disabled,
		onClearMarkers,
		header,
		thumbnailDataUrl,
	}: Props = $props();

	const displayName = $derived(hostName ? hostInfo(hostName).displayName : null);
</script>

<section class="relative flex flex-col gap-3 rounded-box border-2 border-base-content/50 p-4">
	<div class="dropdown dropdown-end absolute top-2 right-2">
		<button type="button" class="btn btn-ghost btn-xs" aria-label="More actions">⋯</button>
		<ul class="dropdown-content menu z-10 w-60 rounded-box bg-base-200 p-2 shadow">
			<li>
				<button type="button" class="text-error" {disabled} onclick={onClearMarkers}>
					Clear all markers in this timeline
				</button>
			</li>
		</ul>
	</div>

	{@render header?.()}

	{#if hostName && displayName}
		<!-- The logo is one line high (1lh), so it follows the title's text size -->
		<div class="flex items-center gap-2 pr-8 font-semibold">
			<HostLogo {hostName} class="size-[1lh] shrink-0" />
			<h2>{displayName}</h2>
		</div>
	{/if}

	{#if status === "connected"}
		{#if thumbnailDataUrl}
			<div
				class="flex aspect-video w-full items-center justify-center rounded-box bg-base-300 text-sm text-base-content/40"
			>
				<img src={thumbnailDataUrl} alt="Host thumbnail" class="h-full w-auto" />
			</div>
		{/if}
		<div class="min-w-0">
			<div class="text-sm text-base-content/60">Current timeline</div>
			{#if timelineName}
				<div class="text-lg font-bold break-words">{timelineName}</div>
			{:else}
				<div class="text-base-content/60">No timeline open</div>
			{/if}
		</div>

		<div class="min-w-0">
			<div class="text-sm text-base-content/60">Current project</div>
			{#if projectName}
				<div class="text-lg font-bold break-words">{projectName}</div>
			{:else}
				<div class="text-base-content/60">No project open</div>
			{/if}
		</div>
	{:else if status === "connecting"}
		<div class="flex items-center gap-2 text-base-content/60">
			<span class="loading loading-spinner loading-sm"></span>
			Connecting…
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			<div class="text-sm text-base-content/60">Not connected</div>
			<div class="break-words text-error">{error}</div>
			<div class="text-sm text-base-content/60">Retrying every few seconds.</div>
			<button type="button" class="btn btn-sm" onclick={onRetry}>Retry now</button>
		</div>
	{/if}
</section>
