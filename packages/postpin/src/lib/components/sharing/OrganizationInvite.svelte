<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import {
		hasRole,
		MANAGER_ROLES,
		ORG_ROLES,
		type InviteLinkRole,
		type OrgRole,
	} from "#lib/roles.ts";
	import {
		getInviteLinks,
		resetInviteLink,
		setInviteLinkEnabled,
	} from "../../../routes/(root)/organizations/[organization]/members/members.remote";

	interface Props {
		organizationId: string;
	}

	let { organizationId }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const canManage = $derived(
		$activeMember.data ? hasRole($activeMember.data.role, MANAGER_ROLES) : false,
	);
	const inviteLinks = $derived(canManage ? await getInviteLinks(organizationId) : []);

	let inviting = $state(false);
	let inviteEmail = $state("");
	let inviteRole: OrgRole = $state("member");
	let inviteSent = $state(false);

	async function inviteMember() {
		inviting = true;
		inviteSent = false;
		const { error } = await authClient.organization.inviteMember({
			organizationId,
			email: inviteEmail,
			role: inviteRole,
		});
		inviting = false;
		if (error) {
			alert(`Could not invite member: ${error.message}`);
			return;
		}
		inviteEmail = "";
		inviteSent = true;
	}

	let updatingLinkRole = $state<string | null>(null);
	let copiedLinkRole = $state<string | null>(null);
	const linkUrl = (token: string) => `${page.url.origin}/auth/join/${token}`;

	async function toggleLink(role: InviteLinkRole, enabled: boolean) {
		updatingLinkRole = role;
		try {
			await setInviteLinkEnabled({ organizationId, role, enabled });
		} catch (e) {
			alert(`Could not update invite link: ${(e as Error).message}`);
		}
		updatingLinkRole = null;
	}

	async function resetLink(role: InviteLinkRole) {
		if (!confirm("Reset this link? The current link will stop working immediately.")) return;
		updatingLinkRole = role;
		try {
			await resetInviteLink({ organizationId, role });
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

<p class="mt-2 text-sm text-base-content/70">Invite someone to the entire organization.</p>

<h4 class="mt-4 font-semibold">Invite by E-Mail</h4>
<div class="mt-2 flex gap-2">
	<input
		type="email"
		placeholder="name@example.com"
		class="input-bordered input w-full"
		bind:value={inviteEmail}
		oninput={() => (inviteSent = false)}
	/>
	<select class="select w-auto capitalize" bind:value={inviteRole} disabled={inviting}>
		{#each ORG_ROLES as role (role)}
			<option value={role}>{role}</option>
		{/each}
	</select>
	<button class="btn btn-primary" onclick={inviteMember} disabled={inviting || !inviteEmail}>
		Invite
		{#if inviting}
			<span class="loading loading-spinner"></span>
		{/if}
	</button>
</div>
{#if inviteSent}
	<p class="mt-1 text-sm text-success">Invitation sent.</p>
{/if}

{#if canManage}
	<h4 class="mt-4 font-semibold">Invite links</h4>
	<p class="text-sm text-base-content/70">Anyone with a link can join with that role.</p>
	<div class="mt-2 flex flex-col gap-2">
		{#each inviteLinks as link (link.role)}
			<div class="flex items-center gap-2">
				<span class="w-20 capitalize">{link.role}</span>
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={link.enabled}
					disabled={updatingLinkRole === link.role}
					onchange={(e) => toggleLink(link.role, e.currentTarget.checked)}
				/>
				{#if link.enabled && link.token}
					<input
						type="text"
						readonly
						class="input w-full font-mono input-sm"
						value={linkUrl(link.token)}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<button class="btn btn-ghost btn-sm" onclick={() => copyLink(link.role, link.token!)}>
						{copiedLinkRole === link.role ? "Copied" : "Copy"}
					</button>
					<button
						class="btn btn-ghost text-error btn-sm"
						onclick={() => resetLink(link.role)}
						disabled={updatingLinkRole === link.role}
					>
						Reset
					</button>
				{:else}
					<span class="text-sm text-base-content/50">Off</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
