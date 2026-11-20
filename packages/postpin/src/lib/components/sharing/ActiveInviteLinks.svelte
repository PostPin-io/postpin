<script lang="ts">
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { remoteErrorMessage } from "#lib/remote-error.ts";
	import { ROLE_LABELS, roleAllows, toRole } from "#lib/roles.ts";
	import {
		getInviteLinks,
		resetInviteLink,
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
	// Also links for roles the invite dialog no longer offers (e.g. old admin links), so they can be turned off
	const active = $derived(links?.current?.filter((l) => l.enabled && l.token) ?? []);

	let busy = $state(false);
	let errorText = $state<string | null>(null);
	let copiedRole = $state<string | null>(null);

	const linkUrl = (token: string) => `${page.url.origin}/auth/join/${token}`;

	async function run(action: () => Promise<unknown>) {
		busy = true;
		errorText = null;
		try {
			await action();
			await links?.refresh();
		} catch (e) {
			errorText = remoteErrorMessage(e);
		}
		busy = false;
	}

	async function copy(role: string, token: string) {
		await navigator.clipboard.writeText(linkUrl(token));
		copiedRole = role;
		setTimeout(() => (copiedRole = null), 2000);
	}
</script>

{#if !mayInvite || links?.error}
	<p class="text-sm text-base-content/60">You can't see the invite links of this {target.type}.</p>
{:else if links?.current}
	{#if active.length === 0}
		<p class="text-sm text-base-content/60">No active invite links.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each active as link (link.role)}
				{@const token = link.token!}
				<li class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
					<span class="w-20 shrink-0 text-sm">{ROLE_LABELS[link.role]}</span>
					<input
						type="text"
						readonly
						aria-label="{ROLE_LABELS[link.role]} invite link"
						class="input min-w-0 flex-1 font-mono input-sm"
						value={linkUrl(token)}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<div class="flex gap-1">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => copy(link.role, token)}
						>
							{copiedRole === link.role ? "Copied" : "Copy"}
						</button>
						{#if link.canManage}
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={busy}
								onclick={() =>
									confirm("Reset this link? The current one stops working.") &&
									run(() => resetInviteLink({ target, role: link.role }))}>Reset</button
							>
							<button
								type="button"
								class="btn btn-ghost text-error btn-sm"
								disabled={busy}
								onclick={() =>
									run(() => setInviteLinkEnabled({ target, role: link.role, enabled: false }))}
								>Turn off</button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	{#if errorText}<p class="text-sm text-error">{errorText}</p>{/if}
{:else}
	<span class="loading loading-sm loading-spinner"></span>
{/if}
