<script lang="ts">
	import { renameProject } from "./ProjectModal.remote";
	import { refreshAll } from "$app/navigation";

	let dialog: HTMLDialogElement | null = null;

	let projectId = $state("");
	let projectName = $state("");
	let renamingproject = $state(false);

	export function open(project: { id: string; name: string }) {
		projectId = project.id;
		projectName = project.name;
		dialog?.showModal();
	}

	async function renameproject() {
		const name = projectName.trim();
		if (!name || renamingproject) return;

		renamingproject = true;
		try {
			await renameProject({ id: projectId, name });
			await refreshAll();
			dialog?.close();
		} finally {
			renamingproject = false;
		}
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Rename Project</h3>

		<div class="flex flex-wrap gap-4 pt-4">
			<div class="form-control w-full">
				<label class="label mb-2" for="rename-project-name">
					<span class="label-text">Project Name</span>
				</label>
				<input
					id="rename-project-name"
					type="text"
					disabled={renamingproject}
					bind:value={projectName}
					placeholder="Type here"
					class="input-bordered input w-full"
					onkeydown={(e) => {
						if (e.key === "Enter") renameproject();
					}}
				/>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={() => dialog?.close()} disabled={renamingproject}>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					onclick={renameproject}
					disabled={renamingproject || !projectName.trim()}
				>
					Rename
					{#if renamingproject}
						<span class="loading loading-spinner"></span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</dialog>
