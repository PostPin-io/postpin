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
		target: InviteTarget;
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

<!-- Nothing while there is nothing pending: it sits under the people with access -->
{#if invitations?.error}
	<p class="text-sm text-error">Could not load the pending invitations.</p>
{:else if invitations?.current?.length}
	<div class="flex flex-col gap-1">
		<h5 class="text-xs text-base-content/60">Invited</h5>
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
		{#if errorText}<p class="text-sm text-error">{errorText}</p>{/if}
	</div>
{/if}
