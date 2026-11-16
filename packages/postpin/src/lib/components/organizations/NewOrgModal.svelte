<script lang="ts">
	import { createOrganization } from "./create-org.ts";

	let dialog: HTMLDialogElement | null = null;

	export function open() {
		problem = null;
		dialog?.showModal();
	}

	let creatingOrg = $state(false);
	let problem = $state<string | null>(null);

	let orgName = $state("");

	async function createOrg() {
		creatingOrg = true;
		problem = null;

		try {
			await createOrganization(orgName);
		} catch (err) {
			problem = err instanceof Error ? err.message : "Could not create the organization.";
			creatingOrg = false;
			return;
		}

		dialog?.close();
		setTimeout(() => {
			creatingOrg = false;
		}, 500);
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box">
		<h3 class="text-lg font-bold">New Organization</h3>

		<div class="flex flex-wrap gap-4 pt-4">
			<div class="form-control w-full">
				<label class="label mb-2" for="org-name">
					<span class="label-text">Organization Name</span>
				</label>
				<input
					id="org-name"
					type="text"
					disabled={creatingOrg}
					bind:value={orgName}
					placeholder="Type here"
					class="input-bordered input w-full"
					onkeydown={(e) => {
						if (e.key === "Enter") {
							createOrg();
						}
					}}
				/>
			</div>

			{#if problem}
				<div class="alert w-full text-sm alert-error" role="alert">{problem}</div>
			{/if}

			<div class="modal-action">
				<button class="btn" onclick={() => dialog?.close()} disabled={creatingOrg}> Cancel </button>
				<button class="btn btn-primary" onclick={createOrg} disabled={creatingOrg}>
					Create
					{#if creatingOrg}
						<span class="loading loading-spinner"></span>
					{/if}
				</button>
			</div>
		</div>
	</div>
</dialog>
