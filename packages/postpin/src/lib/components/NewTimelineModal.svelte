<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import { slugify } from "#lib/slug.ts";
	import { invalidateAll, refreshAll } from "$app/navigation";
	import { createTimeline } from "./TimelineModal.remote";

	interface Props {
		projectId: string;
	}
	let { projectId }: Props = $props();
	let dialog: HTMLDialogElement | null = null;

	export function open() {
		dialog?.showModal();
	}

	let creatingTimeline = $state(false);

	let timelineName = $state("");

	async function createtimeline() {
		creatingTimeline = true;

		await createTimeline({ name: timelineName, projectId: projectId });

		await refreshAll();

		dialog?.close();
		setTimeout(() => {
			creatingTimeline = false;
		}, 500);
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">New Timeline</h3>

		<div class="flex flex-wrap gap-4 pt-4">
			<div class="form-control w-full">
				<label class="label mb-2" for="timeline-name">
					<span class="label-text">Timeline Name</span>
				</label>
				<input
					id="timeline-name"
					type="text"
					disabled={creatingTimeline}
					bind:value={timelineName}
					placeholder="Type here"
					class="input-bordered input w-full"
					onkeydown={(e) => {
						if (e.key === "Enter") {
							createtimeline();
						}
					}}
				/>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={() => dialog?.close()} disabled={creatingTimeline}>
					Cancel
				</button>
				<button class="btn btn-primary" onclick={createtimeline} disabled={creatingTimeline}>
					Create
					{#if creatingTimeline}
						<span class="loading loading-spinner"></span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</dialog>
