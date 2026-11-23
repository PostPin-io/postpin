<script lang="ts">
	// One field for both ways of adding someone: a name or address of an org member gives them access
	// right away, an unknown e-mail address sends an invitation. On the organization itself only the
	// invitation is left: everyone in it is in already.
	import { authClient } from "#lib/auth-client.ts";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { remoteErrorMessage, remoteErrorStatus } from "#lib/remote-error.ts";
	import {
		canInviteAs,
		INVITE_ROLES,
		ROLE_LABELS,
		roleAllows,
		TARGET_INVITE_ROLES,
		toRole,
		type InviteRole,
	} from "#lib/roles.ts";
	import { Role } from "@postpin-io/shared/db/enums";
	import { addGrant, getTargetAccess } from "./grants.remote";
	import {
		getTargetInvitations,
		inviteMember,
	} from "../../../routes/(root)/organizations/[organization]/settings/members/members.remote";

	interface Props {
		target: InviteTarget;
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	const isOrg = $derived(target.type === "organization");
	const mayGrant = $derived(role && !isOrg ? roleAllows(role, "grant", "create") : false);
	const mayInvite = $derived(role ? roleAllows(role, "invitation", "create") : false);
	const inviteRoles = $derived(
		role ? (isOrg ? INVITE_ROLES : TARGET_INVITE_ROLES).filter((r) => canInviteAs(role, r)) : [],
	);
	// Reviewers never get a request; members without a matching grant land in access.error
	const access = $derived(
		mayGrant && target.type !== "organization" ? getTargetAccess(target) : undefined,
	);

	let search = $state("");
	let inviteRole: InviteRole = $state(Role.REVIEWER);
	let busy = $state(false);
	let message = $state<{ text: string; error: boolean } | null>(null);

	const query = $derived(search.trim().toLowerCase());
	const isEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query));
	const allCandidates = $derived(access?.current?.candidates ?? []);
	const candidates = $derived(
		query
			? allCandidates.filter(
					(m) =>
						m.user.name.toLowerCase().includes(query) || m.user.email.toLowerCase().includes(query),
				)
			: allCandidates,
	);
	// An address of someone already in the org is added, not invited
	const offerInvite = $derived(
		mayInvite && isEmail && !allCandidates.some((m) => m.user.email.toLowerCase() === query),
	);

	async function add(member: { id: string; user: { name: string } }) {
		if (target.type === "organization") return; // no candidates there
		const grantTarget = target;
		busy = true;
		message = null;
		try {
			await addGrant({ memberId: member.id, target: grantTarget });
			await access?.refresh();
			message = { text: `${member.user.name} now has access.`, error: false };
			search = "";
		} catch (e) {
			message = {
				text: `Could not add ${member.user.name}: ${remoteErrorMessage(e)}`,
				error: true,
			};
		}
		busy = false;
	}

	async function invite() {
		const email = search.trim();
		busy = true;
		message = null;
		try {
			await inviteMember({ email, role: inviteRole, target });
			await getTargetInvitations(target).refresh();
			message = { text: `Invited ${email}.`, error: false };
			search = "";
		} catch (e) {
			const status = remoteErrorStatus(e);
			// 409: already in the org. Not among the candidates, so they can open it already (or are an admin)
			const text =
				status === 409
					? isOrg
						? `${email} is already a member.`
						: `${email} already has access.`
					: status === 400
						? "This doesn't look like a valid e-mail address."
						: `Could not invite: ${remoteErrorMessage(e)}`;
			message = { text, error: true };
		}
		busy = false;
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (offerInvite) invite();
		else if (candidates.length === 1) add(candidates[0]);
	}
</script>

{#if !mayGrant && !mayInvite}
	<p class="text-sm text-base-content/60">You can't add people to this {target.type}.</p>
{:else if access?.error && !mayInvite}
	<p class="text-sm text-base-content/60">
		You can't add people from your organization to this {target.type}.
	</p>
{:else if mayGrant && !access?.current && !access?.error}
	<span class="loading loading-sm loading-spinner"></span>
{:else}
	<form class="flex flex-col gap-2" onsubmit={submit}>
		<input
			type="search"
			placeholder={isOrg ? "E-mail" : mayInvite ? "Name or e-mail" : "Search by name or e-mail"}
			aria-label="Name or e-mail address"
			autocomplete="off"
			class="input w-full"
			bind:value={search}
			oninput={() => (message = null)}
		/>

		{#if offerInvite}
			<div class="flex flex-wrap items-center gap-2 rounded-box bg-base-200 p-2">
				<p class="min-w-0 flex-1 text-sm">
					Invite <span class="font-medium break-all">{search.trim()}</span> as
				</p>
				<div class="flex items-center gap-2">
					<select
						class="select w-auto select-sm"
						aria-label="Role"
						bind:value={inviteRole}
						disabled={busy}
					>
						{#each inviteRoles as r (r)}
							<option value={r}>{ROLE_LABELS[r]}</option>
						{/each}
					</select>
					<button class="btn btn-primary btn-sm" disabled={busy}>Send</button>
				</div>
			</div>
		{/if}
	</form>

	{#if access?.current}
		{#if allCandidates.length === 0}
			<p class="text-sm text-base-content/60">Everyone in your organization already has access.</p>
		{:else if candidates.length > 0}
			<ul class="flex max-h-48 flex-col overflow-y-auto">
				{#each candidates as m (m.id)}
					<li class="flex items-center gap-2 rounded-box px-1 py-1.5 hover:bg-base-200">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm">{m.user.name}</p>
							<p class="truncate text-xs text-base-content/60">{m.user.email}</p>
						</div>
						<span class="text-xs text-base-content/60">{ROLE_LABELS[m.role]}</span>
						<button
							type="button"
							class="btn btn-outline btn-primary btn-xs"
							disabled={busy}
							onclick={() => add(m)}>Add</button
						>
					</li>
				{/each}
			</ul>
		{:else if !offerInvite}
			<p class="text-sm text-base-content/60">
				No matches.{#if mayInvite}
					Enter an e-mail to invite.{/if}
			</p>
		{/if}
	{/if}

	{#if message}
		<p class="text-sm {message.error ? 'text-error' : 'text-success'}">{message.text}</p>
	{/if}
{/if}
