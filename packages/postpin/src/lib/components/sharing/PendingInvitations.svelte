<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { remoteErrorMessage } from "#lib/remote-error.ts";
	import { ROLE_LABELS, roleAllows, toRole } from "#lib/roles.ts";
	import {
		cancelInvitation,
		getTargetInvitations,
		resendInvitation,
	} from "../../../routes/(root)/organizations/[organization]/settings/members/members.remote";

	interface Props {
		target: Exclude<InviteTarget, { type: "organization" }>;
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	const mayInvite = $derived(role ? roleAllows(role, "invitation", "create") : false);
	const invitations = $derived(mayInvite ? getTargetInvitations(target) : undefined);

	let busy = $state(false);
	let errorText = $state<string | null>(null);

	async function run(action: () => Promise<unknown>) {
		busy = true;
		errorText = null;
		try {
			await action();
			await invitations?.refresh();
		} catch (e) {
			errorText = remoteErrorMessage(e);
		}
		busy = false;
	}
</script>

{#if !mayInvite || invitations?.error}
	<p class="text-sm text-base-content/60">You can't see the invitations to this {target.type}.</p>
{:else if invitations?.current}
	{#if invitations.current.length === 0}
		<p class="text-sm text-base-content/60">No pending invitations.</p>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each invitations.current as inv (inv.id)}
				<li class="flex items-center gap-2 text-sm">
					<span class="min-w-0 flex-1 truncate">{inv.email}</span>
					<span class="text-base-content/60">{ROLE_LABELS[inv.role]}</span>
					{#if inv.canResend}
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							disabled={busy}
							onclick={() => run(() => resendInvitation(inv.id))}>Resend</button
						>
					{/if}
					{#if inv.canDelete}
						<button
							type="button"
							class="btn btn-ghost text-error btn-xs"
							disabled={busy}
							onclick={() => run(() => cancelInvitation(inv.id))}>Revoke</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if errorText}<p class="text-sm text-error">{errorText}</p>{/if}
{:else}
	<span class="loading loading-sm loading-spinner"></span>
{/if}
