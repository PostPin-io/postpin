<script lang="ts">
	import { onMount } from "svelte";
	import { jobStateBadges } from "#lib/job-status.ts";
	import {
		getHealth,
		getJobs,
		getQueueOverview,
		removeJob,
		retryJob,
		sendTestEmail,
	} from "./admin.remote";

	let stateFilter = $state<Filter>("failed");
	let jobsQuery = $derived(getJobs({ state: stateFilter }));
	let testMail = $state<{ ok: boolean; message: string } | null>(null);
	let sending = $state(false);

	type Filter = "failed" | "active" | "waiting" | "delayed" | "completed" | undefined;
	const FILTERS: { value: Filter; label: string }[] = [
		{ value: "failed", label: "Failed" },
		{ value: "active", label: "Active" },
		{ value: "waiting", label: "Waiting" },
		{ value: "delayed", label: "Delayed" },
		{ value: "completed", label: "Completed" },
		{ value: undefined, label: "All" },
	];
	const COUNT_COLUMNS = ["active", "waiting", "delayed", "failed", "completed"] as const;
	let expanded = $state<string | null>(null);

	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	function ago(ms: number | undefined) {
		if (!ms) return "";
		const s = Math.round((ms - Date.now()) / 1000);
		for (const [unit, size] of [
			["day", 86400],
			["hour", 3600],
			["minute", 60],
		] as const) {
			if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
		}
		return rtf.format(s, "second");
	}

	onMount(() => {
		const interval = setInterval(() => {
			getQueueOverview().refresh();
			jobsQuery.refresh();
		}, 2000);
		return () => clearInterval(interval);
	});

	async function onTestMail() {
		sending = true;
		testMail = null;
		try {
			await sendTestEmail();
			testMail = { ok: true, message: "Sent. Check your inbox." };
		} catch (e) {
			testMail = { ok: false, message: e instanceof Error ? e.message : String(e) };
		} finally {
			sending = false;
		}
	}

	async function act(fn: () => Promise<unknown>) {
		try {
			await fn();
			await jobsQuery.refresh();
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e)); // oder euer Toast
		}
	}

	function formatDate(ms: number | undefined) {
		return ms
			? new Date(ms).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" })
			: "N/A";
	}
</script>

{#snippet dot(ok: boolean)}
	<span class="status {ok ? 'status-success' : 'status-error'}"></span>
{/snippet}

<div class="space-y-10">
	<!-- System -->
	<section class="space-y-3">
		<div class="flex items-baseline justify-between">
			<h2 class="text-lg font-semibold">
				System
				{#await getHealth() then health}
					<span class="ml-2 font-mono text-xs font-normal opacity-50">{health.version}</span>
				{/await}
			</h2>
			<button class="btn btn-ghost btn-xs" onclick={() => getHealth().refresh()}>Refresh</button>
		</div>

		{#await getHealth()}
			<span class="loading loading-sm loading-spinner"></span>
		{:then health}
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
				{#each [["Database", health.database], ["Storage", health.storage], ["Redis", health.redis]] as const as [label, r] (label)}
					<span class="flex items-center gap-2" title={r.ok ? undefined : r.error}>
						{@render dot(r.ok)}
						{label}
						<span class="opacity-50">{r.ok ? `${r.ms} ms` : "error"}</span>
					</span>
				{/each}
				<span class="flex items-center gap-2">
					{@render dot(health.smtp.configured)}
					Email
					{#if health.smtp.configured}
						<button class="link link-hover opacity-60" disabled={sending} onclick={onTestMail}>
							{sending ? "sending…" : "send test"}
						</button>
					{:else}
						<span class="opacity-50">not configured</span>
					{/if}
				</span>
			</div>

			{#each [["Database", health.database], ["Storage", health.storage], ["Redis", health.redis]] as const as [label, r] (label)}
				{#if !r.ok}<p class="text-xs text-error">{label}: {r.error}</p>{/if}
			{/each}
			{#if testMail}
				<p class="text-xs {testMail.ok ? 'text-success' : 'text-error'}">{testMail.message}</p>
			{/if}
		{/await}
	</section>

	<!-- Queues -->
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Queues</h2>
		<svelte:boundary>
			<table class="table table-sm">
				<thead>
					<tr>
						<th></th>
						<th class="text-right">Workers</th>
						{#each COUNT_COLUMNS as c (c)}
							<th class="text-right capitalize">{c}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each await getQueueOverview() as q (q.name)}
						<tr>
							<td class="font-medium">
								{q.name}
								{#if q.paused}<span class="badge badge-soft badge-xs badge-warning">paused</span
									>{/if}
							</td>
							<td
								class="text-right tabular-nums {q.workers === 0 ? 'font-semibold text-error' : ''}"
							>
								{q.workers}
							</td>
							{#each COUNT_COLUMNS as c (c)}
								{@const n = q.counts[c] ?? 0}
								<td
									class="text-right tabular-nums"
									class:opacity-30={n === 0}
									class:text-error={c === "failed" && n > 0}
									class:font-semibold={c === "failed" && n > 0}
								>
									{n}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			{#snippet failed(e)}
				<p class="text-sm text-error">Queues unreachable: {e instanceof Error ? e.message : e}</p>
			{/snippet}
		</svelte:boundary>
	</section>

	<!-- Jobs -->
	<section class="space-y-3">
		<div class="flex items-center justify-between gap-4">
			<h2 class="text-lg font-semibold">Jobs</h2>
			<div role="tablist" class="tabs tabs-border tabs-sm">
				{#each FILTERS as f (f.label)}
					<button
						role="tab"
						class="tab"
						class:tab-active={stateFilter === f.value}
						onclick={() => (stateFilter = f.value)}
					>
						{f.label}
					</button>
				{/each}
			</div>
		</div>

		<table class="table table-sm">
			<tbody>
				{#each await jobsQuery as job (job.key)}
					{@const badge = jobStateBadges[job.state ?? "unknown"]}
					<tr
						class="cursor-pointer hover:bg-base-200"
						onclick={() => (expanded = expanded === job.key ? null : job.key)}
					>
						<td>
							<div class="font-medium">{job.name}</div>
							<div class="font-mono text-xs opacity-50" title={job.id}>
								{job.queue} · {job.id?.slice(0, 8)}
							</div>
						</td>
						<td class="max-w-sm">
							{#if job.state === "active" && job.progress}
								<progress
									class="progress w-32 progress-primary"
									value={Math.round(job.progress * 100)}
									max="100"
								></progress>
							{:else if job.failedReason}
								<span class="line-clamp-1 text-sm text-error" title={job.failedReason}
									>{job.failedReason}</span
								>
							{:else if !stateFilter}
								<span class="badge badge-soft badge-xs {badge.badge}">{badge.text}</span>
							{/if}
						</td>
						<td
							class="text-right text-xs whitespace-nowrap opacity-60"
							title={formatDate(job.finishedOn ?? job.timestamp)}
						>
							{ago(job.finishedOn ?? job.timestamp)}
						</td>
						<td class="w-0 text-right whitespace-nowrap" onclick={(e) => e.stopPropagation()}>
							{#if job.state === "failed"}
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => act(() => retryJob({ queue: job.queue, id: job.id! }))}
									>Retry</button
								>
							{/if}
							{#if job.state !== "active"}
								<button
									class="btn btn-ghost opacity-60 btn-xs"
									onclick={() =>
										confirm("Remove job?") &&
										act(() => removeJob({ queue: job.queue, id: job.id! }))}>Remove</button
								>
							{/if}
						</td>
					</tr>
					{#if expanded === job.key}
						<tr>
							<td colspan="4" class="bg-base-200">
								<div class="grid gap-3 text-xs md:grid-cols-2">
									<div>
										<div class="mb-1 font-semibold opacity-60">Data</div>
										<pre class="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(
												job.data,
												null,
												2,
											)}</pre>
									</div>
									<div>
										<div class="mb-1 font-semibold opacity-60">
											Attempts {job.attemptsMade} · created {formatDate(job.timestamp)}
										</div>
										{#if job.stacktrace?.length}
											<pre
												class="overflow-x-auto whitespace-pre-wrap text-error">{job.stacktrace.at(
													-1,
												)}</pre>
										{:else if job.returnvalue}
											<pre class="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(
													job.returnvalue,
													null,
													2,
												)}</pre>
										{/if}
									</div>
								</div>
							</td>
						</tr>
					{/if}
				{:else}
					<tr><td class="py-8 text-center text-sm opacity-50">No {stateFilter ?? ""} jobs</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>
