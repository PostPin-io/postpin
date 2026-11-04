<script lang="ts">
	import type { Snippet } from "svelte";
	import HostLogo from "./HostLogo.svelte";
	import { hostInfo } from "./hosts";

	interface Props {
		hostName: string;
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
		timelineName,
		projectName,
		disabled,
		onClearMarkers,
		header,
		thumbnailDataUrl,
	}: Props = $props();

	const displayName = $derived(hostInfo(hostName).displayName);
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

	<!-- The logo is one line high (1lh), so it follows the title's text size -->
	<div class="flex items-center gap-2 pr-8 font-semibold">
		<HostLogo {hostName} class="size-[1lh] shrink-0" />
		<h2>{displayName}</h2>
	</div>

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
</section>
