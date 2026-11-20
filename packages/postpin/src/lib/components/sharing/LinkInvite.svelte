<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { remoteErrorMessage } from "#lib/remote-error.ts";
	import {
		ROLE_LABELS,
		roleAllows,
		TARGET_INVITE_ROLES,
		toRole,
		type InviteRole,
	} from "#lib/roles.ts";
	import { Role } from "@postpin-io/shared/db/enums";
	import RoleInfoTip from "./RoleInfoTip.svelte";
	import {
		getInviteLinks,
		setInviteLinkEnabled,
	} from "../../../routes/(root)/organizations/[organization]/settings/members/members.remote";

	interface Props {
		target: Exclude<InviteTarget, { type: "organization" }>;
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	const mayInvite = $derived(role ? roleAllows(role, "invitation", "create") : false);
	const links = $derived(mayInvite ? getInviteLinks(target) : undefined);

	// getInviteLinks returns only the roles one may hand out
	const roles = $derived(
		TARGET_INVITE_ROLES.filter((r) => links?.current?.some((l) => l.role === r)),
	);
	let linkRole: InviteRole = $state(Role.REVIEWER);
	const link = $derived(links?.current?.find((l) => l.role === linkRole));

	let busy = $state(false);
	let copied = $state(false);
	let errorText = $state<string | null>(null);

	const linkUrl = (token: string) => `${page.url.origin}/auth/join/${token}`;

	async function enable() {
		busy = true;
		errorText = null;
		try {
			await setInviteLinkEnabled({ target, role: linkRole, enabled: true });
			await links?.refresh();
		} catch (e) {
			errorText = `Could not create the link: ${remoteErrorMessage(e)}`;
		}
		busy = false;
	}

	async function copy(token: string) {
		await navigator.clipboard.writeText(linkUrl(token));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

{#if !mayInvite}
	<p class="text-sm text-base-content/60">You can't invite people to this {target.type}.</p>
{:else if links?.error}
	<p class="text-sm text-error">Could not load invite links.</p>
{:else if links?.current}
	<div class="flex items-center gap-2">
		<select
			class="select flex-1"
			aria-label="Role"
			bind:value={linkRole}
			onchange={() => (errorText = null)}
			disabled={busy}
		>
			{#each roles as r (r)}
				<option value={r}>{ROLE_LABELS[r]}</option>
			{/each}
		</select>
		<RoleInfoTip />
	</div>

	{#if link?.enabled && link.token}
		{@const token = link.token}
		<div class="flex gap-2">
			<input
				type="text"
				readonly
				aria-label="Invite link"
				class="input w-full font-mono input-sm"
				value={linkUrl(token)}
				onfocus={(e) => e.currentTarget.select()}
			/>
			<button type="button" class="btn btn-primary btn-sm" onclick={() => copy(token)}>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	{:else if link?.canManage}
		<button type="button" class="btn btn-primary" disabled={busy} onclick={enable}>
			Create link
		</button>
	{:else}
		<p class="text-sm text-base-content/60">
			The {ROLE_LABELS[linkRole].toLowerCase()} link is turned off. Only the person who created it or
			an admin can turn it on again.
		</p>
	{/if}
	{#if errorText}<p class="text-sm text-error">{errorText}</p>{/if}
{:else}
	<span class="loading loading-sm loading-spinner"></span>
{/if}
