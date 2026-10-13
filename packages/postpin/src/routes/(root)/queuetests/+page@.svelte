<script lang="ts">
	import { onMount } from "svelte";
	import { clearJobs, getJobs } from "./queuetests.remote";
	import type { JobState } from "bullmq";

	function formatDate(ms: number | undefined) {
		return ms
			? new Date(ms).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" })
			: "N/A";
	}

	const jobStateBadges: Record<JobState | "unknown", { badge: string; text: string }> = {
		active: { badge: "badge-primary", text: "Active" },
		completed: { badge: "badge-success", text: "Completed" },
		failed: { badge: "badge-error", text: "Failed" },
		delayed: { badge: "badge-warning", text: "Delayed" },
		"waiting-children": { badge: "badge-info", text: "Waiting Children" },
		waiting: { badge: "badge-info", text: "Waiting" },
		prioritized: { badge: "badge-info", text: "Prioritized" },
		unknown: { badge: "badge-ghost", text: "Unknown" },
	};

	onMount(() => {
		const interval = setInterval(() => {
			getJobs().refresh();
		}, 1000);

		return () => clearInterval(interval);
	});
</script>

{#snippet json(value: unknown)}
	{#if value === undefined || value === null}
		N/A
	{:else}
		<code class="break-all">{JSON.stringify(value)}</code>
	{/if}
{/snippet}

{#snippet text(value: string | undefined)}
	{#if value}
		<span class="block max-w-48 truncate" title={value}>{value}</span>
	{:else}
		N/A
	{/if}
{/snippet}

{#snippet hugeJson(value: unknown)}
	{#if value === undefined || value === null}
		N/A
	{:else}
		<div class="tooltip">
			<div class="tooltip-content max-w-xl text-left">
				<pre class="break-all whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
			</div>
			<span>i</span>
		</div>
	{/if}
{/snippet}

<div>
	Jobs:
	<button class="btn btn-error" onclick={() => clearJobs()}>Clear Jobs</button>
	<div class="overflow-x-auto">
		<table class="table table-xs">
			<thead>
				<tr>
					<th>ID</th>
					<th>Queue</th>
					<th>Name</th>
					<th>State</th>
					<th>Progress</th>
					<th>Data</th>
					<th>Options</th>
					<th>Return Value</th>
					<th>Failed Reason</th>
					<th>Stacktrace</th>
					<th>Deferred Failure</th>
					<th>Delay</th>
					<th>Priority</th>
					<th>Attempts Started</th>
					<th>Attempts Made</th>
					<th>Stalled Counter</th>
					<th>Created At</th>
					<th>Processed On</th>
					<th>Finished On</th>
					<th>Processed By</th>
					<th>Parent Key</th>
					<th>Parent</th>
					<th>Repeat Job Key</th>
					<th>Deduplication ID</th>
				</tr>
			</thead>
			<tbody>
				{#each await getJobs() as job (job.key)}
					<tr>
						<td>{job.id}</td>
						<td>{job.queue}</td>
						<td>{job.name}</td>
						<td>
							<span class="badge badge-xs {jobStateBadges[job.state ?? 'unknown'].badge}">
								{jobStateBadges[job.state ?? "unknown"].text}
							</span>
						</td>
						<td>
							{#if job.progress}
								{@const progress = Math.round(job.progress * 100)}
								<progress class="progress w-56" value={progress} max="100"> </progress>
							{:else}
								N/A
							{/if}
						</td>
						<td>{@render hugeJson(job.data)}</td>
						<td>{@render hugeJson(job.opts)}</td>
						<td>{@render hugeJson(job.returnvalue)}</td>
						<td>{@render text(job.failedReason)}</td>
						<td>{@render hugeJson(job.stacktrace)}</td>
						<td>{@render text(job.deferredFailure)}</td>
						<td>{job.delay}</td>
						<td>{job.priority}</td>
						<td>{job.attemptsStarted}</td>
						<td>{job.attemptsMade}</td>
						<td>{job.stalledCounter}</td>
						<td>{formatDate(job.timestamp)}</td>
						<td>{formatDate(job.processedOn)}</td>
						<td>{formatDate(job.finishedOn)}</td>
						<td>{@render text(job.processedBy)}</td>
						<td>{@render text(job.parentKey)}</td>
						<td>{@render hugeJson(job.parent)}</td>
						<td>{@render text(job.repeatJobKey)}</td>
						<td>{@render text(job.deduplicationId)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
