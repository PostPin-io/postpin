<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import { deleteProject } from "./ProjectModal.remote.ts";

	let dialog: HTMLDialogElement | null = null;

	let project = $state<{ id: string; name: string } | null>(null);
	let deleting = $state(false);
	let errorMessage = $state<string | null>(null);

	export function open(deletableProject: { id: string; name: string }) {
		project = deletableProject;

		dialog?.showModal();
	}

	async function confirmDelete() {
		if (!project) return;
		deleting = true;

		try {
			await deleteProject({ id: project.id });
			await refreshAll();
			dialog?.close();
		} catch (e) {
			errorMessage = "The project was not deleted";
			console.error(e);
		} finally {
			deleting = false;
		}
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Delete Project</h3>

		<p class="py-4">
			Are you sure you want to delete <strong>{project?.name}</strong>? This action cannot be
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
