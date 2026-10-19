<script lang="ts">
	import { renameTimeline } from "./TimelineModal.remote";
	import { refreshAll } from "$app/navigation";

	let { projectId }: { projectId: string } = $props();

	let dialog: HTMLDialogElement | null = null;

	let timelineId = $state("");
	let timelineName = $state("");
	let renamingtimeline = $state(false);

	export function open(timeline: { id: string; name: string }) {
		timelineId = timeline.id;
		timelineName = timeline.name;

		dialog?.showModal();
	}

	async function renametimeline() {
		const name = timelineName.trim();
		if (!name || renamingtimeline) return;

		renamingtimeline = true;
		try {
			await renameTimeline({ id: timelineId, projectId, name });
			await refreshAll();
			dialog?.close();
		} finally {
			renamingtimeline = false;
		}
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Rename Timeline</h3>

		<div class="flex flex-wrap gap-4 pt-4">
			<div class="form-control w-full">
				<label class="label mb-2" for="rename-timeline-name">
					<span class="label-text">Timeline Name</span>
				</label>
				<input
					id="rename-timeline-name"
					type="text"
					disabled={renamingtimeline}
					bind:value={timelineName}
					placeholder="Type here"
					class="input-bordered input w-full"
					onkeydown={(e) => {
						if (e.key === "Enter") renametimeline();
					}}
				/>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={() => dialog?.close()} disabled={renamingtimeline}>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					onclick={renametimeline}
					disabled={renamingtimeline || !timelineName.trim()}
				>
					Rename
					{#if renamingtimeline}
						<span class="loading loading-spinner"></span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</dialog>
