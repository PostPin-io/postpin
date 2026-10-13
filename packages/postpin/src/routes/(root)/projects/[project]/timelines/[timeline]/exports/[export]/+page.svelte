<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { getExport, getUrl } from "./export.remote";

	const exportQuery = $derived(
		getExport({
			projectId: page.params.project ?? "",
			timelineId: page.params.timeline ?? "",
			exportId: page.params.export ?? "",
		}),
	);

	onMount(() => {
		const interval = setInterval(() => {
			if (exportQuery.current?.media?.status === "PROCESSING") {
				exportQuery.refresh();
			}
		}, 1000);

		return () => clearInterval(interval);
	});

	const exp = $derived(await exportQuery);
	const media = $derived(exp.media);
</script>

<h1>{exp.name}</h1>

{#if !media}
	<p>Nothing uploaded yet.</p>
{:else}
	<p>Status: {media.status}</p>

	{#if media.original.width && media.original.height}
		<p>Resolution: {media.original.width}x{media.original.height}</p>
	{/if}

	{#each media.jobs as job (job.id)}
		<div class="flex items-center gap-2" title={job.failedReason}>
			<span class="w-32">{job.label}</span>
			<span class="w-20">{job.state}</span>
			{#if job.state === "active" || job.state === "waiting"}
				<progress class="progress w-24" value={job.progress * 100} max="100"></progress>
			{/if}
		</div>
	{/each}

	{#if media.status !== "PENDING"}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={await getUrl({ mediaId: media.id, type: "original" })}
			poster={media.thumbnail ? await getUrl({ mediaId: media.id, type: "thumbnail" }) : undefined}
			controls
			aria-label="Export video"
			class="max-h-[70vh]"
		></video>
	{/if}

	{#if media.proxies.length > 0}
		<h2>Proxies</h2>
		<div class="flex flex-wrap gap-4">
			{#each media.proxies as proxy (proxy.id)}
				<figure>
					{#if proxy.status === "COMPLETED"}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={await getUrl({ mediaId: media.id, type: "proxy", proxyId: proxy.id })}
							controls
							aria-label="Proxy {proxy.width}x{proxy.height}"
							class="h-40"
						></video>
					{/if}
					<figcaption>{proxy.width}x{proxy.height} – {proxy.status}</figcaption>
				</figure>
			{/each}
		</div>
	{/if}
{/if}
