<script lang="ts">
	import {
		changeInvitationRole,
		getInviteLinks,
		getOrg,
		resetInviteLink,
		setInviteLinkEnabled,
	} from "./members.remote";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import {
		hasRole,
		MANAGER_ROLES,
		ORG_ROLES,
		type InviteLinkRole,
		type OrgRole,
	} from "#lib/roles.ts";

	const org = $derived(await getOrg(page.params.organization!));

	let changingRoleOf = $state<string | null>(null);
	async function changeRole(memberId: string, newRole: string) {
		changingRoleOf = memberId;
		const { error } = await authClient.organization.updateMemberRole({
			organizationId: org.id,
			memberId,
			role: newRole,
		});
		if (error) {
			alert(`Could not change role: ${error.message}`);
		}
		await getOrg(page.params.organization!).refresh();
		changingRoleOf = null;
	}

	let inviting = $state(false);
	let inviteEmail = $state("");
	let inviteRole: OrgRole = $state("member");
	async function inviteMember() {
		inviting = true;
		const { error } = await authClient.organization.inviteMember({
			organizationId: org.id,
			email: inviteEmail,
			role: inviteRole,
		});
		if (error) {
			alert(`Could not invite member: ${error.message}`);
		}
		await getOrg(page.params.organization!).refresh();
		inviting = false;
	}
	let resendingInviteId: string | null = $state(null);
	let cancelingInviteId: string | null = $state(null);

	const canManage = $derived(hasRole(org.myRole, MANAGER_ROLES));
	const inviteLinks = $derived(canManage ? await getInviteLinks(org.id) : []);
	let updatingLinkRole = $state<string | null>(null);
	let copiedLinkRole = $state<string | null>(null);

	const linkUrl = (token: string) => `${page.url.origin}/auth/join/${token}`;

	async function toggleLink(role: InviteLinkRole, enabled: boolean) {
		updatingLinkRole = role;
		try {
			await setInviteLinkEnabled({ organizationId: org.id, role, enabled });
		} catch (e) {
			alert(`Could not update invite link: ${(e as Error).message}`);
		}
		updatingLinkRole = null;
	}

	async function resetLink(role: InviteLinkRole) {
		if (!confirm("Reset this link? The current link will stop working immediately.")) return;
		updatingLinkRole = role;
		try {
			await resetInviteLink({ organizationId: org.id, role });
		} catch (e) {
			alert(`Could not reset invite link: ${(e as Error).message}`);
		}
		updatingLinkRole = null;
	}

	async function copyLink(role: string, token: string) {
		await navigator.clipboard.writeText(linkUrl(token));
		copiedLinkRole = role;
		setTimeout(() => (copiedLinkRole = null), 1500);
	}
</script>

{#snippet roleSelect(value: OrgRole, onchange: (value: OrgRole) => void, disabled: boolean)}
	<select
		{value}
		class="select capitalize"
		onchange={(e) => onchange(e.currentTarget.value as OrgRole)}
		{disabled}
	>
		{#each ORG_ROLES as role (role)}
			<option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
		{/each}
	</select>
{/snippet}

<div class="flex flex-col gap-4 p-6">
	<header class="flex items-baseline justify-between gap-4">
		<h1 class="text-2xl font-bold">{org.name} Members</h1>
	</header>

	<h2 class="text-lg font-semibold">Members</h2>
	<div class="overflow-x-auto rounded-box bg-base-100 shadow">
		<table class="table w-full">
			<thead>
				<tr>
					<th>Name</th>
					<th>Email</th>
					<th>Role</th>
				</tr>
			</thead>
			<tbody>
				{#each org.members as member (member.id)}
					<tr>
						<td>{member.user.name}</td>
						<td>{member.user.email}</td>
						<td>
							{@render roleSelect(
								member.role as OrgRole,
								(role) => changeRole(member.id, role),
								changingRoleOf === member.id,
							)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2 class="text-lg font-semibold">Invite by E-Mail</h2>
	<div class="overflow-x-auto rounded-box bg-base-100 shadow">
		<div class="m-3 flex gap-3">
			<input
				type="email"
				placeholder="name@example.com"
				class="input-bordered input w-full"
				bind:value={inviteEmail}
			/>
			{@render roleSelect(
				inviteRole,
				(role) => {
					inviteRole = role;
				},
				inviting,
			)}
			<button class="btn btn-primary" onclick={inviteMember} disabled={inviting}>
				Invite
				{#if inviting}
					<span class="loading loading-spinner"></span>
				{/if}
			</button>
		</div>
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
				{#each org.invitations.filter((o) => o.status === "pending") as invite (invite.id)}
					<tr>
						<td>{invite.email}</td>
						<td
							>{@render roleSelect(
								invite.role as OrgRole,
								async (role) => {
									await changeInvitationRole({
										invitationId: invite.id,
										role,
									});
									await getOrg(page.params.organization!).refresh();
								},
								false,
							)}</td
						>
						<td>{new Date(invite.createdAt).toLocaleString()}</td>
						<td>
							<div class="flex">
								<button
									class="btn btn-ghost btn-sm"
									onclick={async () => {
										resendingInviteId = invite.id;
										const result = await authClient.organization.inviteMember({
											organizationId: org.id,
											email: invite.email,
											role: invite.role as OrgRole,
											resend: true,
										});
										if (result.error) {
											alert(`Could not resend invite: ${result.error.message}`);
										}
										resendingInviteId = null;
									}}
									disabled={!!resendingInviteId || !!cancelingInviteId}
								>
									Resend {#if resendingInviteId === invite.id}
										<span class="loading loading-spinner"></span>
									{/if}
								</button>
								<button
									class="btn btn-error btn-sm"
									onclick={async () => {
										cancelingInviteId = invite.id;
										const result = await authClient.organization.cancelInvitation({
											invitationId: invite.id,
										});
										if (result.error) {
											alert(`Could not revoke invite: ${result.error.message}`);
										}
										await getOrg(page.params.organization!).refresh();
										cancelingInviteId = null;
									}}
									disabled={!!resendingInviteId || !!cancelingInviteId}
								>
									Revoke
									{#if cancelingInviteId === invite.id}
										<span class="loading loading-spinner"></span>
									{/if}
								</button>
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

	{#if canManage}
		<h2 class="text-lg font-semibold">Invite links</h2>
		<p class="text-sm text-base-content/70">
			Anyone with a link can join with that role. Reset a link to invalidate the old one.
		</p>
		<div class="overflow-x-auto rounded-box bg-base-100 shadow">
			<table class="table w-full">
				<thead>
					<tr>
						<th>Role</th>
						<th>Enabled</th>
						<th>Link</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each inviteLinks as link (link.role)}
						<tr>
							<td class="capitalize">{link.role}</td>
							<td>
								<input
									type="checkbox"
									class="toggle toggle-sm"
									checked={link.enabled}
									disabled={updatingLinkRole === link.role}
									onchange={(e) => toggleLink(link.role, e.currentTarget.checked)}
								/>
							</td>
							<td class="w-full">
								{#if link.enabled && link.token}
									<input
										type="text"
										readonly
										class="input w-full font-mono input-sm"
										value={linkUrl(link.token)}
										onfocus={(e) => e.currentTarget.select()}
									/>
								{:else}
									<span class="text-sm text-base-content/50">Off</span>
								{/if}
							</td>
							<td>
								{#if link.enabled && link.token}
									<div class="flex">
										<button
											class="btn btn-ghost btn-sm"
											onclick={() => copyLink(link.role, link.token!)}
										>
											{copiedLinkRole === link.role ? "Copied" : "Copy"}
										</button>
										<button
											class="btn btn-ghost text-error btn-sm"
											onclick={() => resetLink(link.role)}
											disabled={updatingLinkRole === link.role}
										>
											Reset
										</button>
									</div>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
