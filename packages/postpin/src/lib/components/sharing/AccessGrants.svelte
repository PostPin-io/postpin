<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import { ORG_ROLES, roleAllows } from "#lib/roles.ts";
	import type { Role } from "@postpin-io/shared/db/enums";
	import { addGrant, getTargetAccess, removeGrant } from "./grants.remote";

	interface Props {
		target: { type: "project" | "timeline"; id: string };
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(
		ORG_ROLES.includes($activeMember.data?.role as Role)
			? ($activeMember.data!.role as Role)
			: null,
	);
	// Reviewers never get a request; members without a matching grant land in access.error
	const mayGrant = $derived(role ? roleAllows(role, "grant", "create") : false);
	const access = $derived(mayGrant ? getTargetAccess(target) : undefined);

	let selected = $state("");
	let busy = $state(false);

	async function add() {
		if (!selected) return;
		busy = true;
		try {
			await addGrant({ memberId: selected, target });
			await access?.refresh();
			selected = "";
		} catch (e) {
			alert(`Could not grant access: ${(e as Error).message}`);
		}
		busy = false;
	}

	async function remove(grantId: string) {
		busy = true;
		try {
			await removeGrant(grantId);
			await access?.refresh();
		} catch (e) {
			alert(`Could not remove access: ${(e as Error).message}`);
		}
		busy = false;
	}
</script>

{#if !mayGrant || access?.error}
	<p class="mt-4 text-sm text-base-content/70">You can't share this {target.type}.</p>
{:else if access?.current}
	{@const a = access.current}
	<h4 class="mt-4 font-semibold">Has access</h4>
	<ul class="mt-2 flex flex-col gap-1">
		{#each a.grants as g (g.id)}
			<li class="flex items-center justify-between">
				<span>{g.member.user.name} <span class="text-base-content/60">({g.member.role})</span></span
				>
				{#if g.canDelete}
					<button class="btn btn-ghost btn-xs" disabled={busy} onclick={() => remove(g.id)}
						>Remove</button
					>
				{/if}
			</li>
		{/each}
		{#each a.inherited as g (g.id)}
			<li class="text-base-content/60">{g.member.user.name} · via project</li>
		{/each}
		<li class="text-sm text-base-content/60">Admins and owners always have access</li>
	</ul>

	{#if a.candidates.length > 0}
		<div class="mt-4 flex gap-2">
			<select class="select-bordered select w-full" bind:value={selected} disabled={busy}>
				<option value="" disabled>Add member…</option>
				{#each a.candidates as m (m.id)}
					<option value={m.id}>{m.user.name} ({m.user.email})</option>
				{/each}
			</select>
			<button class="btn btn-primary" disabled={busy || !selected} onclick={add}>Add</button>
		</div>
	{/if}
{:else}
	<span class="loading mt-4 loading-spinner"></span>
{/if}
