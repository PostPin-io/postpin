<script lang="ts">
	import { renameExport } from "./ExportModal.remote";
	import { refreshAll } from "$app/navigation";

	let dialog: HTMLDialogElement | null = null;

	let exportId = $state("");
	let exportName = $state("");
	let renamingexport = $state(false);

	export function open(singleExport: { id: string; name: string }) {
		exportId = singleExport.id;
		exportName = singleExport.name;

		dialog?.showModal();
	}

	async function renameexport() {
		const name = exportName.trim();
		if (!name || renamingexport) return;

		renamingexport = true;
		try {
			await renameExport({ id: exportId, name });
			await refreshAll();
			dialog?.close();
		} finally {
			renamingexport = false;
		}
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">Rename Export</h3>

		<div class="flex flex-wrap gap-4 pt-4">
			<div class="form-control w-full">
				<label class="label mb-2" for="rename-export-name">
					<span class="label-text">Export Name</span>
				</label>
				<input
					id="rename-export-name"
					type="text"
					disabled={renamingexport}
					bind:value={exportName}
					placeholder="Type here"
					class="input-bordered input w-full"
					onkeydown={(e) => {
						if (e.key === "Enter") renameexport();
					}}
				/>
			</div>

			<div class="modal-action">
				<button class="btn" onclick={() => dialog?.close()} disabled={renamingexport}>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					onclick={renameexport}
					disabled={renamingexport || !exportName.trim()}
				>
					Rename
					{#if renamingexport}
						<span class="loading loading-spinner"></span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</dialog>
