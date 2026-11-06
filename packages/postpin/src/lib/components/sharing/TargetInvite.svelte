<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import {
		canInviteAs,
		INVITE_ROLES,
		ROLE_LABELS,
		roleAllows,
		toRole,
		type InviteRole,
	} from "#lib/roles.ts";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { Role } from "@postpin-io/shared/db/enums";
	import {
		cancelInvitation,
		getInviteLinks,
		getTargetInvitations,
		inviteMember,
		resendInvitation,
		resetInviteLink,
		setInviteLinkEnabled,
	} from "../../../routes/(root)/organizations/[organization]/members/members.remote";

	interface Props {
		target: Exclude<InviteTarget, { type: "organization" }>;
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));

	// Reviewer: neither → no requests, nothing shown
	const mayInvite = $derived(role ? roleAllows(role, "invitation", "create") : false);
	const inviteRoles = $derived(role ? INVITE_ROLES.filter((r) => canInviteAs(role, r)) : []);

	const invitations = $derived(mayInvite ? getTargetInvitations(target) : undefined);
	const links = $derived(mayInvite ? getInviteLinks(target) : undefined);

	let email = $state("");
	let inviteRole: InviteRole = $state(Role.REVIEWER);
	let busy = $state(false);
	let hint = $state<string | null>(null);

	async function invite(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		hint = null;
		try {
			await inviteMember({ email, role: inviteRole, target });
			await invitations?.refresh();
			email = "";
		} catch (e) {
			const err = e as { status?: number; message: string };
			// inviteMember answers 409 for people already in the org
			hint =
				err.status === 409
					? "This person is already in the organization. Give them access under “Has access” above."
					: `Could not invite: ${err.message}`;
		}
		busy = false;
	}

	async function run(action: () => Promise<unknown>, refresh: () => Promise<unknown> | undefined) {
		busy = true;
		try {
			await action();
			await refresh();
		} catch (e) {
			alert((e as Error).message);
		}
		busy = false;
	}

	const linkUrl = (token: string) => `${page.url.origin}/auth/join/${token}`;
</script>

{#if mayInvite}
	<h4 class="mt-4 font-semibold">Invite people outside the organization</h4>
	<p class="text-sm text-base-content/70">
		They join the organization with the chosen role and get access to this {target.type}.
	</p>

	<form class="mt-2 flex gap-2" onsubmit={invite}>
		<input
			type="email"
			required
			placeholder="name@example.com"
			class="input-bordered input w-full"
			bind:value={email}
		/>
		<select class="select w-auto" bind:value={inviteRole} disabled={busy}>
			{#each inviteRoles as r (r)}
				<option value={r}>{ROLE_LABELS[r]}</option>
			{/each}
		</select>
		<button class="btn btn-primary" disabled={busy || !email}>Invite</button>
	</form>
	{#if hint}<p class="mt-1 text-sm text-warning">{hint}</p>{/if}

	{#if invitations?.current?.length}
		<ul class="mt-2 flex flex-col gap-1">
			{#each invitations.current as inv (inv.id)}
				<li class="flex items-center gap-2 text-sm">
					<span class="flex-1 truncate">{inv.email}</span>
					<span class="text-base-content/60">{ROLE_LABELS[inv.role]}</span>
					{#if inv.canResend}
						<button
							class="btn btn-ghost btn-xs"
							disabled={busy}
							onclick={() =>
								run(
									() => resendInvitation(inv.id),
									() => invitations?.refresh(),
								)}>Resend</button
						>
					{/if}
					{#if inv.canDelete}
						<button
							class="btn btn-ghost text-error btn-xs"
							disabled={busy}
							onclick={() =>
								run(
									() => cancelInvitation(inv.id),
									() => invitations?.refresh(),
								)}>Revoke</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<h4 class="mt-4 font-semibold">Invite links</h4>
	<p class="text-sm text-base-content/70">
		Anyone with the link joins with that role and gets access to this {target.type}.
	</p>
	{#if links?.current}
		<div class="mt-2 flex flex-col gap-2">
			{#each links.current as link (link.role)}
				<div class="flex items-center gap-2">
					<span class="w-20">{ROLE_LABELS[link.role]}</span>
					<input
						type="checkbox"
						class="toggle toggle-sm"
						checked={link.enabled}
						disabled={busy || !link.canManage}
						onchange={(e) =>
							run(
								() =>
									setInviteLinkEnabled({
										target,
										role: link.role,
										enabled: e.currentTarget.checked,
									}),
								() => links?.refresh(),
							)}
					/>
					{#if link.enabled && link.token}
						<input
							type="text"
							readonly
							class="input w-full font-mono input-sm"
							value={linkUrl(link.token)}
							onfocus={(e) => e.currentTarget.select()}
						/>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => navigator.clipboard.writeText(linkUrl(link.token!))}>Copy</button
						>
						{#if link.canManage}
							<button
								class="btn btn-ghost text-error btn-sm"
								disabled={busy}
								onclick={() =>
									confirm("Reset this link? The current one stops working.") &&
									run(
										() => resetInviteLink({ target, role: link.role }),
										() => links?.refresh(),
									)}>Reset</button
							>
						{/if}
					{:else}
						<span class="text-sm text-base-content/50">Off</span>
					{/if}
				</div>
			{/each}
		</div>
	{:else if links?.error}
		<p class="text-sm text-error">Could not load invite links.</p>
	{/if}
{/if}
