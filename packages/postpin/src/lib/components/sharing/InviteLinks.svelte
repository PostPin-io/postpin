<script lang="ts">
	// The invite links of one organization, project or timeline: one row per role, each switched on
	// and off in place. Used by the invitations dialog and the members settings alike.
	import { page } from "$app/state";
	import type { InviteTarget } from "#lib/invite-target.ts";
	import { remoteErrorMessage, remoteErrorStatus } from "#lib/remote-error.ts";
	import { ROLE_LABELS, TARGET_INVITE_ROLES, type InviteRole } from "#lib/roles.ts";
	import {
		getInviteLinks,
		resetInviteLink,
		setInviteLinkEnabled,
	} from "../../../routes/(root)/organizations/[organization]/settings/members/members.remote";

	interface Props {
		target: InviteTarget;
	}
	let { target }: Props = $props();

	// The members page awaits this query before mounting us, so `.current` is filled from the start
	const links = $derived(getInviteLinks(target));
	const problem = $derived(
		links.error ? (remoteErrorStatus(links.error) === 403 ? "forbidden" : "failed") : null,
	);
	// Projects and timelines offer no Admin links, but an old one stays listed while on, so it can be turned off
	const rows = $derived(
		(links.current ?? []).filter(
			(l) => target.type === "organization" || TARGET_INVITE_ROLES.includes(l.role) || l.enabled,
		),
	);

	let busyRole = $state<InviteRole | null>(null);
	let confirmingReset = $state<InviteRole | null>(null);
	let copiedRole = $state<InviteRole | null>(null);
	let errorText = $state<string | null>(null);
	const inputs: Partial<Record<InviteRole, HTMLInputElement>> = $state({});

	const linkUrl = (token: string) => `${page.url.origin}/auth/join/${token}`;

	async function run(role: InviteRole, action: () => Promise<unknown>) {
		busyRole = role;
		confirmingReset = null;
		errorText = null;
		try {
			await action();
			await links.refresh();
		} catch (e) {
			errorText = remoteErrorMessage(e);
		}
		busyRole = null;
	}

	const setEnabled = (role: InviteRole, enabled: boolean) =>
		run(role, () => setInviteLinkEnabled({ target, role, enabled }));

	async function copy(role: InviteRole, token: string, input: HTMLInputElement | undefined) {
		try {
			await navigator.clipboard.writeText(linkUrl(token));
			copiedRole = role;
			setTimeout(() => (copiedRole = null), 2000);
		} catch {
			// No clipboard access (e.g. insecure origin): select the URL so it can be copied by hand
			input?.select();
		}
	}
</script>

{#if problem === "forbidden"}
	<p class="text-sm text-base-content/60">You can't see the invite links of this {target.type}.</p>
{:else if problem}
	<p class="text-sm text-error">Could not load the invite links.</p>
{:else if !links.current}
	<span class="loading loading-sm loading-spinner"></span>
{:else}
	<ul class="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
		{#each rows as link (link.role)}
			{@const busy = busyRole === link.role}
			<li class="flex flex-col gap-2 p-3">
				<div class="flex items-center gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium">
							{ROLE_LABELS[link.role]}
							{#if target.type !== "organization" && !TARGET_INVITE_ROLES.includes(link.role)}
								<span class="badge badge-ghost badge-sm">no longer offered</span>
							{/if}
						</p>
					</div>
					{#if link.canManage}
						<button
							type="button"
							class="btn btn-sm {link.enabled ? 'btn-ghost text-error' : 'btn-outline btn-primary'}"
							aria-label="{link.enabled ? 'Turn off' : 'Turn on'} the {ROLE_LABELS[
								link.role
							]} invite link"
							disabled={busy}
							onclick={() => setEnabled(link.role, !link.enabled)}
						>
							{#if busy}<span class="loading loading-xs loading-spinner"></span>{/if}
							{link.enabled ? "Turn off" : "Turn on"}
						</button>
					{/if}
				</div>

				{#if link.enabled && link.token}
					{@const token = link.token}
					<div class="flex gap-2">
						<input
							type="text"
							readonly
							aria-label="{ROLE_LABELS[link.role]} invite link URL"
							class="input min-w-0 flex-1 font-mono input-sm"
							value={linkUrl(token)}
							bind:this={inputs[link.role]}
							onfocus={(e) => e.currentTarget.select()}
						/>
						<button
							type="button"
							class="btn btn-primary btn-sm"
							onclick={() => copy(link.role, token, inputs[link.role])}
						>
							{copiedRole === link.role ? "Copied" : "Copy"}
						</button>
						{#if link.canManage}
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={busy}
								onclick={() => (confirmingReset = link.role)}
							>
								New link
							</button>
						{/if}
					</div>
					{#if !link.canManage && link.createdBy}
						<p class="text-xs text-base-content/60">
							Created by {link.createdBy.name ?? "a former member"}
						</p>
					{/if}
				{/if}

				{#if confirmingReset === link.role}
					<div
						role="alert"
						class="alert flex flex-wrap items-center gap-2 alert-soft py-2 alert-warning"
					>
						<p class="flex-1 text-sm">Replace? The old link stops working.</p>
						<div class="flex gap-1">
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => (confirmingReset = null)}
							>
								Cancel
							</button>
							<button
								type="button"
								class="btn btn-sm btn-warning"
								onclick={() => {
									const role = link.role;
									run(role, () => resetInviteLink({ target, role }));
								}}
							>
								Replace
							</button>
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if errorText}<p class="text-sm text-error">{errorText}</p>{/if}
{/if}
