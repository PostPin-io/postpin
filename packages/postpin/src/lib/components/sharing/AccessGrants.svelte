<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import { remoteErrorMessage } from "#lib/remote-error.ts";
	import { ROLE_LABELS, roleAllows, toRole } from "#lib/roles.ts";
	import { getTargetAccess, removeGrant } from "./grants.remote";

	interface Props {
		target: { type: "project" | "timeline"; id: string };
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	// Reviewers never get a request; members without a matching grant land in access.error
	const mayGrant = $derived(role ? roleAllows(role, "grant", "create") : false);
	const access = $derived(mayGrant ? getTargetAccess(target) : undefined);

	let busy = $state(false);
	let errorText = $state<string | null>(null);

	async function remove(grantId: string) {
		busy = true;
		errorText = null;
		try {
			await removeGrant(grantId);
			await access?.refresh();
		} catch (e) {
			errorText = `Could not remove access: ${remoteErrorMessage(e)}`;
		}
		busy = false;
	}
</script>

{#if !mayGrant || access?.error}
	<p class="text-sm text-base-content/60">You can't see who has access to this {target.type}.</p>
{:else if access?.current}
	{@const a = access.current}
	<ul class="flex flex-col gap-1">
		{#each a.grants as g (g.id)}
			<li class="flex items-center gap-2 text-sm">
				<span class="min-w-0 flex-1 truncate">{g.member.user.name}</span>
				<span class="text-base-content/60">{ROLE_LABELS[g.member.role]}</span>
				{#if g.canDelete}
					<button
						type="button"
						class="btn btn-ghost text-error btn-xs"
						disabled={busy}
						onclick={() => remove(g.id)}>Remove</button
					>
				{/if}
			</li>
		{/each}
		{#each a.inherited as g (g.id)}
			<li class="flex items-center gap-2 text-sm text-base-content/60">
				<span class="min-w-0 flex-1 truncate">{g.member.user.name}</span>
				<span>via project</span>
			</li>
		{/each}
		{#if a.grants.length === 0 && a.inherited.length === 0}
			<li class="text-sm text-base-content/60">Nobody has been added yet.</li>
		{/if}
	</ul>
	<p class="text-xs text-base-content/60">Admins and owners always have access.</p>
	{#if errorText}<p class="text-sm text-error">{errorText}</p>{/if}
{:else}
	<span class="loading loading-sm loading-spinner"></span>
{/if}
