<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import { deleteTimeline } from "./TimelineModal.remote.ts"; // Pfad ggf. anpassen

	let dialog: HTMLDialogElement | null = null;

	let timeline = $state<{ id: string; name: string; projectId: string } | null>(null);
	let deleting = $state(false);
	let errorMessage = $state<string | null>(null);

	export function open(deletableTimeline: { id: string; name: string; projectId: string }) {
		timeline = deletableTimeline;
		errorMessage = null;

		dialog?.showModal();
	}

	async function confirmDelete() {
		if (!timeline) return;
		deleting = true;
		errorMessage = null;

		try {
			await deleteTimeline({ id: timeline.id, projectId: timeline.projectId });
			await refreshAll();
			dialog?.close();
		} catch (e) {
			errorMessage = "The timeline was not deleted";
			console.error(e);
		} finally {
			deleting = false;
		}
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Delete Timeline</h3>

		<p class="py-4">
			Are you sure you want to delete <strong>{timeline?.name}</strong>? This action cannot be
			undone.
		</p>

		{#if errorMessage}
			<div class="mb-4 alert alert-error">{errorMessage}</div>
		{/if}

		<div class="modal-action">
			<button class="btn" onclick={() => dialog?.close()} disabled={deleting}>Cancel</button>
			<button class="btn btn-error" onclick={confirmDelete} disabled={deleting}>
				Delete
				{#if deleting}
					<span class="loading loading-spinner"></span>
				{/if}
			</button>
		</div>
	</div>
</dialog>
