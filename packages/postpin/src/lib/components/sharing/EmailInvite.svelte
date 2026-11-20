<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { remoteErrorMessage, remoteErrorStatus } from "#lib/remote-error.ts";
	import {
		canInviteAs,
		ROLE_LABELS,
		roleAllows,
		TARGET_INVITE_ROLES,
		toRole,
		type InviteRole,
	} from "#lib/roles.ts";
	import { Role } from "@postpin-io/shared/db/enums";
	import RoleInfoTip from "./RoleInfoTip.svelte";
	import { inviteMember } from "../../../routes/(root)/organizations/[organization]/settings/members/members.remote";

	interface Props {
		target: Exclude<InviteTarget, { type: "organization" }>;
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	const mayInvite = $derived(role ? roleAllows(role, "invitation", "create") : false);
	const inviteRoles = $derived(role ? TARGET_INVITE_ROLES.filter((r) => canInviteAs(role, r)) : []);

	let email = $state("");
	let inviteRole: InviteRole = $state(Role.REVIEWER);
	let busy = $state(false);
	let message = $state<{ text: string; error: boolean } | null>(null);

	async function invite(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;
		try {
			await inviteMember({ email, role: inviteRole, target });
			message = { text: `Invitation sent to ${email}.`, error: false };
			email = "";
		} catch (e) {
			const status = remoteErrorStatus(e);
			// inviteMember answers 409 for people already in the org, 400 when the address fails validation
			const text =
				status === 409
					? "This person is already in your organization. Add them under Team Members instead."
					: status === 400
						? "This doesn't look like a valid e-mail address."
						: `Could not invite: ${remoteErrorMessage(e)}`;
			message = { text, error: true };
		}
		busy = false;
	}
</script>

{#if mayInvite}
	<form class="flex flex-col gap-2" onsubmit={invite}>
		<input
			type="email"
			required
			placeholder="name@example.com"
			aria-label="E-mail address"
			class="input w-full"
			bind:value={email}
			oninput={() => (message = null)}
		/>
		<div class="flex items-center gap-2">
			<select class="select flex-1" aria-label="Role" bind:value={inviteRole} disabled={busy}>
				{#each inviteRoles as r (r)}
					<option value={r}>{ROLE_LABELS[r]}</option>
				{/each}
			</select>
			<button class="btn btn-primary" disabled={busy || !email}>Send invite</button>
			<RoleInfoTip />
		</div>
	</form>
	{#if message}
		<p class="text-sm {message.error ? 'text-error' : 'text-success'}">{message.text}</p>
	{/if}
{:else}
	<p class="text-sm text-base-content/60">You can't invite people to this {target.type}.</p>
{/if}
