<script lang="ts">
	import { onMount } from "svelte";
	import { getVideos, getUploadUrl, processVideo, getUrl } from "./videotests.remote";

	// poll while jobs are running so their state and progress stay current
	onMount(() => {
		const interval = setInterval(() => {
			if (getVideos().current?.some((video) => video.status === "PROCESSING")) {
				getVideos().refresh();
			}
		}, 1000);

		return () => clearInterval(interval);
	});

	let uploadProgress: string[] = $state([]);

	async function uploadVideo() {
		uploadProgress = ["Requesting upload URL..."];
		const { mediaId, uploadUrl } = await getUploadUrl();
		uploadProgress.push(`Upload URL received. Media ID: ${mediaId}`);
		const file = await pickFile();
		if (!file) {
			uploadProgress.push("No file selected. Upload canceled.");
			return;
		}
		uploadProgress.push("Uploading video to S3...");
		await fetch(uploadUrl, {
			method: "PUT",
			body: file,
			headers: {
				"Content-Type": file.type,
			},
		});
		uploadProgress.push("Starting video processing...");
		await processVideo(mediaId);
		uploadProgress.push("Video uploaded and processing jobs added.");
	}

	async function pickFile(): Promise<File | null> {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "video/*";
		return new Promise((resolve) => {
			input.onchange = () => {
				if (input.files && input.files.length > 0) {
					resolve(input.files[0]);
				} else {
					resolve(null);
				}
			};
			input.click();
		});
	}
</script>

<div>
	Actions:
	<button class="btn" onclick={() => getVideos().refresh()}>Refresh Videos</button>
	<button class="btn" onclick={() => uploadVideo()}>Upload Video</button>
</div>

<pre>{uploadProgress.join("\n")}</pre>

{#snippet resolution(value: { width: number | null; height: number | null })}
	{#if value.width && value.height}
		<span>{value.width}x{value.height}</span>
	{:else}
		N/A
	{/if}
{/snippet}

<div>
	Videos:
	<div class="overflow-x-auto">
		<table class="table table-xs">
			<thead>
				<tr>
					<th>ID</th>
					<th>Status</th>
					<th>Resolution</th>
					<th>Jobs</th>
					<th>Original</th>
					<th>Thumbnail</th>
					<th>Proxies</th>
				</tr>
			</thead>
			<tbody>
				{#each await getVideos() as video (video.id)}
					<tr>
						<td>{video.id}</td>
						<td>{video.status}</td>
						<td>{@render resolution(video.original)}</td>
						<td>
							{#each video.jobs as job (job.id)}
								<div class="flex items-center gap-2" title={job.failedReason}>
									<span class="w-32">{job.label}</span>
									<span class="w-20">{job.state}</span>
									{#if job.state === "active" || job.state === "waiting"}
										<progress class="progress w-24" value={job.progress * 100} max="100"></progress>
									{/if}
								</div>
							{:else}
								N/A
							{/each}
						</td>
						<td>
							{#if video.status != "PENDING"}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									src={await getUrl({ mediaId: video.id, type: "original" })}
									controls
									aria-label="Original Video"
									class="h-30"
								></video>
							{:else}
								N/A
							{/if}
						</td>
						<td>
							<img
								src={await getUrl({ mediaId: video.id, type: "thumbnail" })}
								alt="Thumbnail"
								class="object-fit h-16"
							/>
						</td>
						<td>
							<table class="table">
								<tbody>
									{#each video.proxies as proxy (proxy.id)}
										<tr>
											<td>{proxy.width}x{proxy.height}</td>
											<td>{proxy.status}</td>
											<td>
												{#if proxy.status === "COMPLETED"}
													<!-- svelte-ignore a11y_media_has_caption -->
													<video
														src={await getUrl({
															mediaId: video.id,
															type: "proxy",
															proxyId: proxy.id,
														})}
														controls
														aria-label="Proxy Video"
														class="h-16"
													></video>
												{:else}
													N/A
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
