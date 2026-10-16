<script lang="ts">
	import { untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { authClient } from "#lib/auth-client.ts";
	import { availableOrganizationSlug, slugify } from "#lib/slug.ts";
	import { getOrganizationSettings } from "./settings.remote.ts";

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
			const { error } = await authClient.organization.update({
				organizationId: organization.id,
				data: { name: trimmed, slug },
			});
			if (error) throw new Error(error.message ?? "Could not rename the organization.");

			if (slug !== organization.slug) {
				await goto(`/organizations/${slug}/settings`, { replaceState: true });
			} else {
				await getOrganizationSettings(slug).refresh();
			}
			message = { type: "success", text: "Name updated." };
		} catch (e) {
			message = { type: "error", text: (e as Error).message };
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{organization.name} settings | PostPin</title>
</svelte:head>

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
				onkeydown={(e) => e.key === "Enter" && saveName()}
				disabled={saving}
			/>
			<button
				class="btn join-item btn-primary btn-sm"
				onclick={saveName}
				disabled={saving || !name.trim() || name.trim() === organization.name}
			>
				Save
				{#if saving}<span class="loading loading-xs loading-spinner"></span>{/if}
			</button>
		</div>
	</fieldset>
</div>
