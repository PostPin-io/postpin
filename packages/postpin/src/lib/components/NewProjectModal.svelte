<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import { createProject } from "./ProjectModal.remote";
	let dialog: HTMLDialogElement | null = null;

	export function open() {
		dialog?.showModal();
	}

	let creatingproject = $state(false);

	let projectName = $state("");

	async function createproject() {
		creatingproject = true;

		try {
			await createProject({ name: projectName });
			await refreshAll();
			dialog?.close();
		} finally {
			creatingproject = false;
		}
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">New Project</h3>

		<div class="flex flex-wrap gap-4 pt-4">
			<div class="form-control w-full">
				<label class="label mb-2" for="proje-name">
					<span class="label-text">Project Name</span>
				</label>
				<input
					id="proje-name"
					type="text"
					disabled={creatingproject}
					bind:value={projectName}
					placeholder="Type here"
					class="input-bordered input w-full"
					onkeydown={(e) => {
						if (e.key === "Enter") {
							createproject();
						}
					}}
				/>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={() => dialog?.close()} disabled={creatingproject}>
					Cancel
				</button>
				<button class="btn btn-primary" onclick={createproject} disabled={creatingproject}>
					Create
					{#if creatingproject}
						<span class="loading loading-spinner"></span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</dialog>
