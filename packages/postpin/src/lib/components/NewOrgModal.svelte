<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import { slugify } from "#lib/slug.ts";
	import { invalidateAll, refreshAll } from "$app/navigation";

	let dialog: HTMLDialogElement | null = null;

	export function open() {
		dialog?.showModal();
	}

	let creatingOrg = $state(false);

	let orgName = $state("");

	async function createOrg() {
		creatingOrg = true;

		const { data, error } = await authClient.organization.create({
			name: orgName,
			slug: slugify(orgName),
			keepCurrentActiveOrganization: false,
		});

		console.log("createOrg", { data, error });

		if (error) {
			alert(`Error creating organization: ${error.message}`);
			creatingOrg = false;
			return;
		}

		await refreshAll();

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
