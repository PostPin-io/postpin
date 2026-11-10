<script lang="ts">
	import CircleX from "@lucide/svelte/icons/circle-x";
	import {
		isJobRunning,
		jobStateBadges,
		totalJobProgress,
		type ProcessingJob,
	} from "#lib/job-status.ts";

	let {
		jobs,
		variant,
	}: {
		jobs: ProcessingJob[];
		/** inline: list in the video pane while it can't play yet; compact: indicator in the menu bar */
		variant: "inline" | "compact";
	} = $props();

	const progress = $derived(totalJobProgress(jobs));
	const failed = $derived(jobs.filter((job) => job.state === "failed"));
	const running = $derived(jobs.some(isJobRunning));
</script>

{#snippet jobList()}
	<ul class="list">
		{#each jobs as job (job.id)}
			{@const badge = jobStateBadges[job.state ?? "unknown"]}
			<li class="list-row items-center py-1.5">
				<div class="{badge.color} w-4">
					{#if job.state === "active"}
						<div
							class="radial-progress"
							style="--value:{job.progress * 100}; --size:1rem; --thickness: 2px;"
						></div>
					{:else}
						<badge.icon size={16} />
					{/if}
				</div>
				<div class="min-w-0">
					<div class="text-sm font-semibold text-nowrap">{job.label}</div>
					{#if job.state === "failed" && job.failedReason}
						<div class="truncate text-xs text-error" title={job.failedReason}>
							{job.failedReason}
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/snippet}

{#if variant === "inline"}
	<div class="flex h-full items-center justify-center p-4" role="status" aria-live="polite">
		<div class="w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-4 shadow">
			<div class="mb-2 flex items-center justify-between">
				<span class="font-semibold">Processing video</span>
				<span class="text-sm text-base-content/70">{Math.round(progress)} %</span>
			</div>
			<progress class="progress w-full progress-primary" value={progress} max="100"></progress>
			{@render jobList()}
		</div>
	</div>
{:else if running || failed.length}
	<details class="dropdown dropdown-end dropdown-top">
		<summary
			class="btn btn-square btn-ghost btn-xs"
			title={failed.length ? `${failed.length} job(s) failed` : "Processing"}
		>
			{#if failed.length}
				<CircleX size={16} class="text-error" />
			{:else}
				<div
					class="radial-progress text-primary"
					style="--value:{progress}; --size:1rem; --thickness: 2px;"
				></div>
			{/if}
		</summary>
		<div class="dropdown-content z-10 mb-2 w-64 rounded-box bg-base-100 p-2 shadow">
			{@render jobList()}
		</div>
	</details>
{/if}
