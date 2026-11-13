<script lang="ts">
	import type { RenderProgress, UploadProgress } from "../bridge";
	import { formatDuration, formatMegabytes } from "./format";

	interface Props {
		renderProgress: RenderProgress | null;
		/** encoding the review versions, 0 to 1 */
		transcodeProgress?: number | null;
		uploadProgress: UploadProgress | null;
	}

	let { renderProgress, transcodeProgress = null, uploadProgress }: Props = $props();
</script>

{#if renderProgress && renderProgress.percent < 100}
	<div class="flex items-center gap-2">
		<!-- NLEs can stay at 0% while they prepare the render, so show an indeterminate bar until then -->
		{#if renderProgress.percent > 0}
			<progress class="progress progress-primary" value={renderProgress.percent} max="100"
			></progress>
		{:else}
			<progress class="progress progress-primary"></progress>
		{/if}
		<span class="text-sm whitespace-nowrap tabular-nums">
			{renderProgress.percent > 0 ? `${Math.round(renderProgress.percent)}%` : "Preparing…"}
			{#if renderProgress.estimatedTimeRemainingMs > 0}
				· {formatDuration(renderProgress.estimatedTimeRemainingMs)} left
			{/if}
		</span>
	</div>
{/if}

<!-- encoding runs while the render uploads: both bars at once -->
{#if transcodeProgress !== null && transcodeProgress < 1}
	<div class="flex items-center gap-2">
		<progress class="progress progress-primary" value={transcodeProgress} max="1"></progress>
		<span class="text-sm whitespace-nowrap tabular-nums">
			Encoding {Math.floor(transcodeProgress * 100)}%
		</span>
	</div>
{/if}

{#if uploadProgress && uploadProgress.uploadedBytes < uploadProgress.totalBytes}
	<div class="flex items-center gap-2">
		<progress
			class="progress progress-primary"
			value={uploadProgress.uploadedBytes}
			max={uploadProgress.totalBytes}
		></progress>
		<span class="text-sm whitespace-nowrap tabular-nums">
			{Math.floor((uploadProgress.uploadedBytes / uploadProgress.totalBytes) * 100)}% ·
			{formatMegabytes(uploadProgress.uploadedBytes)} / {formatMegabytes(uploadProgress.totalBytes)}
		</span>
	</div>
{/if}
