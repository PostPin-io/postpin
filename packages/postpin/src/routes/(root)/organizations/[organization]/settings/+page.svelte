<script lang="ts">
	import PageMeta from "#lib/components/PageMeta.svelte";
	import { untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { availableOrganizationSlug } from "#lib/slug.ts";
	import { getOrganizationSettings, renameOrganization } from "./settings.remote.ts";
	import { authClient } from "#lib/auth-client.ts";
	import { deleteOrganization } from "./settings.remote.ts";

	let deleteDialog: HTMLDialogElement | null = null;
	let confirmName = $state("");
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	async function removeOrganization() {
		deleting = true;
		deleteError = null;
		try {
			await deleteOrganization({ organizationId: organization.id, confirmName });
		} catch (e) {
			deleteError =
				(e as { body?: { message?: string } }).body?.message ??
				"Could not delete the organization.";
			deleting = false;
			return;
		}
		// the org switcher and session still hold the deleted org
		authClient.$store.notify("$listOrg");
		authClient.$store.notify("$sessionSignal");
		await goto("/dashboard", { invalidateAll: true });
	}

	type Message = { type: "success" | "error"; text: string } | null;

	const organization = $derived(await getOrganizationSettings(page.params.organization!));

	let name = $state("");
	let saving = $state(false);
	let message = $state<Message>(null);

	// reset the input whenever we land on a different organization (not on refresh after saving)
	const organizationId = $derived(organization.id);
	$effect.pre(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		organizationId;
		untrack(() => {
			name = organization.name;
			message = null;
		});
	});

	async function saveName() {
		const trimmed = name.trim();
		if (!trimmed) {
			message = { type: "error", text: "Name can't be empty." };
			return;
		}
		if (trimmed === organization.name) return;

		saving = true;
		message = null;
		try {
			const slug = await availableOrganizationSlug(trimmed, organization.slug);
			await renameOrganization({ organizationId: organization.id, name: trimmed, slug });

			if (slug !== organization.slug) {
				await goto(`/organizations/${slug}/settings`, { replaceState: true });
			} else {
				await getOrganizationSettings(slug).refresh();
			}
			message = { type: "success", text: "Name updated." };
		} catch (e) {
			const body = (e as { body?: { message?: string } }).body;
			message = { type: "error", text: body?.message ?? (e as Error).message };
		} finally {
			saving = false;
		}
	}
</script>

<PageMeta
	title="{organization.name} settings"
	description="Manage the settings of {organization.name}."
/>

<div class="flex flex-col gap-4 p-6">
	<header class="flex items-baseline justify-between gap-4">
		<h1 class="text-2xl font-bold">Organization settings</h1>
		<p class="text-sm text-base-content/70">
			Created {new Date(organization.createdAt).toLocaleDateString()}
		</p>
	</header>

	<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
		<legend class="fieldset-legend">Name</legend>
		{#if message}
			<div
				class="alert alert-soft py-2 text-sm"
				class:alert-error={message.type === "error"}
				class:alert-success={message.type === "success"}
				role={message.type === "error" ? "alert" : "status"}
			>
				<span>{message.text}</span>
				<button
					class="btn btn-ghost btn-xs"
					aria-label="Close message"
					onclick={() => (message = null)}>×</button
				>
			</div>
		{/if}
		<label class="label" for="org-name">Organization name</label>
		<div class="join w-full">
			<input
				id="org-name"
				type="text"
				class="input join-item w-full input-sm"
				bind:value={name}
				onkeydown={(e) => e.key === "Enter" && organization.canRename && saveName()}
				disabled={saving || !organization.canRename}
			/>
			{#if organization.canRename}
				<button
					class="btn join-item btn-primary btn-sm"
					onclick={saveName}
					disabled={saving || !name.trim() || name.trim() === organization.name}
				>
					Save
					{#if saving}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			{/if}
		</div>
		{#if !organization.canRename}
			<p class="label">Only owners can rename the organization.</p>
		{/if}
	</fieldset>
	{#if organization.canDelete}
		<fieldset class="fieldset rounded-box border border-error/40 bg-base-100 p-4">
			<legend class="fieldset-legend text-error">Danger zone</legend>
			<p class="text-sm">
				Deletes the organization with all projects, timelines, exports, markers and videos. This
				can't be undone.
			</p>
			<button
				class="btn w-fit btn-outline btn-error btn-sm"
				onclick={() => {
					confirmName = "";
					deleteError = null;
					deleteDialog?.showModal();
				}}
			>
				Delete organization
			</button>
		</fieldset>
	{/if}
</div>
<dialog class="modal" bind:this={deleteDialog}>
	<div class="modal-box flex flex-col gap-3">
		<h3 class="text-lg font-bold">Delete {organization.name}?</h3>
		<p class="text-sm">Type <span class="font-semibold">{organization.name}</span> to confirm.</p>
		<input class="input w-full" bind:value={confirmName} disabled={deleting} />
		{#if deleteError}<p class="text-sm text-error">{deleteError}</p>{/if}
		<div class="modal-action">
			<button class="btn" onclick={() => deleteDialog?.close()} disabled={deleting}>Cancel</button>
			<button
				class="btn btn-error"
				onclick={removeOrganization}
				disabled={deleting || confirmName.trim() !== organization.name}
			>
				Delete forever
				{#if deleting}<span class="loading loading-xs loading-spinner"></span>{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
