<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import {
		getInviteLinks,
		cancelInvitation,
		changeInvitationRole,
		changeMemberRole,
		getOrg,
		inviteMember as inviteMemberCommand,
		removeMember,
		resendInvitation,
	} from "./members.remote";

	import { page } from "$app/state";
	import { ROLE_LABELS, type InviteRole } from "#lib/roles.ts";

	import { Role } from "@postpin-io/shared/db/enums";
	import MemberGrantsModal from "./MemberGrantsModal.svelte";
	import InviteLinks from "#lib/components/sharing/InviteLinks.svelte";
	import GuideButton from "#lib/components/guides/GuideButton.svelte";
	let grantsModal: MemberGrantsModal | null = null;

	const org = $derived(await getOrg(page.params.organization!));
	const orgTarget = $derived({ type: "organization" as const, id: org.id }); // bzw. organizationId
	// Loaded here with `await` so InviteLinks mounts with data: a `.current` result arriving during
	// a navigation can stay stale
	const inviteLinksLoaded = $derived(
		org.canManageInviteLinks
			? await getInviteLinks(orgTarget).then(
					() => true,
					() => true,
				)
			: false,
	);

	let changingRoleOf = $state<string | null>(null);
	async function changeRole(memberId: string, newRole: Role) {
		changingRoleOf = memberId;
		try {
			await changeMemberRole({ memberId, role: newRole });
		} catch (e) {
			alert(`Could not change role: ${(e as Error).message}`);
			changingRoleOf = null;
			return;
		}
		// Header, menus and useActiveMember still hold the old role
		if (memberId === org.myMemberId) {
			location.reload();
			return;
		}
		await getOrg(page.params.organization!).refresh();
		changingRoleOf = null;
	}
	let removingMemberId = $state<string | null>(null);

	async function remove(member: (typeof org.members)[number]) {
		if (
			!confirm(`Remove ${member.user.name} from ${org.name}? They lose access to everything in it.`)
		)
			return;
		removingMemberId = member.id;
		try {
			await removeMember(member.id);
		} catch (e) {
			alert(`Could not remove member: ${(e as Error).message}`);
		}
		removingMemberId = null;
	}

	let inviting = $state(false);
	let inviteEmail = $state("");
	let inviteRole: InviteRole = $state(Role.REVIEWER);

	async function inviteMember() {
		inviting = true;
		try {
			await inviteMemberCommand({
				email: inviteEmail,
				role: inviteRole,
				target: { type: "organization", id: org.id },
			});
			inviteEmail = "";
		} catch (e) {
			alert(`Could not invite member: ${(e as Error).message}`);
		}
		inviting = false;
	}
	let resendingInviteId: string | null = $state(null);
	let cancelingInviteId: string | null = $state(null);
	let changingInviteRoleOf: string | null = $state(null);

	async function changeInviteRole(invitationId: string, role: InviteRole) {
		changingInviteRoleOf = invitationId;
		try {
			await changeInvitationRole({ invitationId, role });
		} catch (e) {
			alert(`Could not change invite role: ${(e as Error).message}`);
		}
		await getOrg(page.params.organization!).refresh();
		changingInviteRoleOf = null;
	}

	async function resendInvite(invite: { id: string }) {
		resendingInviteId = invite.id;
		try {
			await resendInvitation(invite.id);
		} catch (e) {
			alert(`Could not resend invite: ${(e as Error).message}`);
		}
		resendingInviteId = null;
	}

	async function revokeInvite(invitationId: string) {
		cancelingInviteId = invitationId;
		try {
			await cancelInvitation(invitationId);
		} catch (e) {
			alert(`Could not revoke invite: ${(e as Error).message}`);
		}
		await getOrg(page.params.organization!).refresh();
		cancelingInviteId = null;
	}
</script>

<PageMeta
	title="{org.name} members"
	description="Manage the members and invitations of {org.name}."
/>

{#snippet roleSelect(
	value: Role,
	roles: readonly Role[],
	onchange: (value: Role) => void,
	disabled: boolean,
)}
	<!-- The current value is always listed, so a select without other options still shows it -->
	{@const options = roles.includes(value) ? roles : [value, ...roles]}
	<select
		{value}
		class="select capitalize"
		onchange={(e) => onchange(e.currentTarget.value as Role)}
		disabled={disabled || options.length < 2}
	>
		{#each options as role (role)}
			<option value={role}>{ROLE_LABELS[role]}</option>
		{/each}
	</select>
{/snippet}

<div class="flex flex-col gap-4 p-6">
	<h2 class="text-lg font-semibold">All Members</h2>

	<div class="overflow-x-auto rounded-box bg-base-100 shadow">
		<table class="table w-full">
			<thead>
				<tr>
					<th>Name</th>
					<th>Email</th>
					<th>Role</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each org.members as member (member.id)}
					<tr>
						<td>{member.user.name}</td>
						<td>{member.user.email}</td>
						<td>
							{@render roleSelect(
								member.role,
								member.assignableRoles,
								(role) => changeRole(member.id, role),
								changingRoleOf === member.id,
							)}
						</td>
						<td>
							<div class="flex justify-end gap-1">
								{#if member.canViewGrants}
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => grantsModal?.open(member.id, member.user.name)}
									>
										Access
									</button>
								{/if}
								{#if member.canRemove}
									<button
										class="btn btn-ghost text-error btn-xs"
										onclick={() => remove(member)}
										disabled={removingMemberId !== null}
									>
										Remove
										{#if removingMemberId === member.id}
											<span class="loading loading-xs loading-spinner"></span>
										{/if}
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if org.canSeeInvitations}
		<div class="flex items-center gap-2">
			<h2 class="text-lg font-semibold">Invite by E-Mail</h2>
			{#if org.canInviteToOrg}<GuideButton guide="invite-team" />{/if}
		</div>
		<div class="overflow-x-auto rounded-box bg-base-100 shadow">
			{#if org.canInviteToOrg}
				<div class="m-3 flex gap-3" data-guide="invite-team/invite">
					<input
						type="email"
						placeholder="name@example.com"
						class="input-bordered input w-full"
						bind:value={inviteEmail}
					/>
					<div data-guide="invite-team/roles">
						{@render roleSelect(
							inviteRole,
							org.inviteRoles,
							(role) => {
								inviteRole = role as InviteRole;
							},
							inviting,
						)}
					</div>
					<button class="btn btn-primary" onclick={inviteMember} disabled={inviting}>
						Invite
						{#if inviting}
							<span class="loading loading-spinner"></span>
						{/if}
					</button>
				</div>
			{/if}
			<table class="table w-full">
				<thead>
					<tr>
						<th>Pending invite</th>
						<th>Role</th>
						<th>Sent</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each org.invitations as invite (invite.id)}
						<tr>
							<td>{invite.email}</td>
							<td>
								{@render roleSelect(
									invite.role,
									invite.canUpdate ? org.inviteRoles : [],
									(role) => changeInviteRole(invite.id, role as InviteRole),
									!invite.canUpdate || changingInviteRoleOf === invite.id,
								)}
							</td>
							<td>{new Date(invite.createdAt).toLocaleString()}</td>
							<td>
								<div class="flex">
									{#if invite.canResend}
										<button
											class="btn btn-ghost btn-sm"
											onclick={() => resendInvite(invite)}
											disabled={!!resendingInviteId || !!cancelingInviteId}
										>
											Resend {#if resendingInviteId === invite.id}
												<span class="loading loading-spinner"></span>
											{/if}
										</button>
									{/if}
									{#if invite.canDelete}
										<button
											class="btn btn-error btn-sm"
											onclick={() => revokeInvite(invite.id)}
											disabled={!!resendingInviteId || !!cancelingInviteId}
										>
											Revoke
											{#if cancelingInviteId === invite.id}
												<span class="loading loading-spinner"></span>
											{/if}
										</button>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="4" class="text-center text-base-content/70"> No pending invites </td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if org.canManageInviteLinks}
		<h2 class="text-lg font-semibold">Invite links</h2>
		<p class="text-sm text-base-content/70">Anyone with a link joins with its role.</p>
		<div data-guide="invite-team/links">
			{#if inviteLinksLoaded}<InviteLinks target={orgTarget} />{/if}
		</div>
	{/if}
</div>

<MemberGrantsModal bind:this={grantsModal} />
