<script lang="ts">
	import { getSharingTarget } from "./sharing.remote";
	import OrgMemberInvite from "./OrgMemberInvite.svelte";
	import EmailInvite from "./EmailInvite.svelte";
	import LinkInvite from "./LinkInvite.svelte";
	import ShareLinks from "./share-links/ShareLinks.svelte";
	import InfoTip from "./InfoTip.svelte";
	import { INVITATION_TTL_HOURS } from "#lib/invite-target.ts";
	import X from "@lucide/svelte/icons/x";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import Mail from "@lucide/svelte/icons/mail";
	import Link from "@lucide/svelte/icons/link";

	type Target = { projectId: string; timelineId?: string; exportId?: string };

	let dialog: HTMLDialogElement | null = null;
	let isOpen = $state(false);
	let target = $state<Target | undefined>();

	const tabs = [
		{
			id: "members",
			label: "Team Members",
			icon: UserGroup,
			description: (type: string) =>
				`People already in your organization get access to this ${type}.`,
		},
		{
			id: "email",
			label: "Via E-Mail",
			icon: Mail,
			description: (type: string) =>
				`They join your organization with the chosen role and only see this ${type}.`,
		},
		{
			id: "link",
			label: "Via Link",
			icon: Link,
			description: (type: string) =>
				`Anyone with the link joins with that role and only sees this ${type}.`,
		},
	] as const;
	let tab = $state<(typeof tabs)[number]["id"]>("members");

	export function open(next: Target) {
		target = next;
		tab = "members";
		isOpen = true;
		dialog?.showModal();
	}

	const targetQuery = $derived(isOpen && target ? getSharingTarget(target) : undefined);
	const isExport = $derived(targetQuery?.current?.type === "export");
</script>

<!-- Phones: a sheet from the bottom that fits the visible viewport (dvh, not vh: iOS counts the address bar into vh) -->
<dialog
	class="modal modal-bottom sm:modal-middle"
	bind:this={dialog}
	onclose={() => (isOpen = false)}
>
	<div
		class="modal-box max-h-[90dvh] pt-0 sm:min-h-[32rem] {isExport
			? 'sm:max-w-3xl'
			: 'sm:max-w-xl'}"
	>
		<!-- Sticky so the close button stays reachable while scrolling long content -->
		<div class="sticky top-0 z-10 -mx-6 flex items-start gap-2 bg-base-100 px-6 pt-6 pb-2">
			<div class="min-w-0 flex-1">
				{#if targetQuery?.current?.type === "export"}
					<h3 class="text-lg font-bold break-words">Share link for {targetQuery.current.name}</h3>
					<p class="text-sm text-base-content/60">For external feedback, no account needed.</p>
				{:else if targetQuery?.current}
					<h3 class="text-lg font-bold break-words">Invite to <i>{targetQuery.current.name}</i></h3>
					<p class="text-sm text-base-content/60">
						Permanent access to this {targetQuery.current.type} for your team.
					</p>
				{:else}
					<h3 class="text-lg font-bold">{target?.exportId ? "Share link" : "Invite"}</h3>
				{/if}
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title="Close"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X size={16} />
			</button>
		</div>

		{#if targetQuery?.error}
			<p class="mt-2 text-sm text-error">
				Could not load this {target?.exportId
					? "export"
					: target?.timelineId
						? "timeline"
						: "project"}.
			</p>
		{:else if targetQuery?.current}
			{#if targetQuery.current.type !== "export"}
				{@const inviteTarget = { type: targetQuery.current.type, id: targetQuery.current.id }}
				{@const type = inviteTarget.type}
				<div role="tablist" class="tabs tabs-border mt-2" aria-label="How to invite">
					{#each tabs as t (t.id)}
						<button
							type="button"
							role="tab"
							class="tab gap-2"
							class:tab-active={tab === t.id}
							aria-selected={tab === t.id}
							onclick={() => (tab = t.id)}
						>
							<t.icon class="size-4" />
							{t.label}
						</button>
					{/each}
				</div>
				<div role="tabpanel" class="mt-4 flex flex-col gap-2">
					<div class="flex items-start gap-2">
						<p class="flex-1 text-sm text-base-content/70">
							{tabs.find((t) => t.id === tab)!.description(type)}
						</p>
						<InfoTip label="What happens next">
							{#if tab === "members"}
								<ul class="list-disc space-y-1 pl-4">
									<li>They can open this {type} right away. No e-mail is sent.</li>
									<li>Their role in the organization stays the same.</li>
									{#if type === "project"}
										<li>Access to a project includes all of its timelines.</li>
									{/if}
									<li>You can take access back anytime under Manage access.</li>
								</ul>
							{:else if tab === "email"}
								<ul class="list-disc space-y-1 pl-4">
									<li>
										We send them an e-mail with a link to join. It stays valid for
										{INVITATION_TTL_HOURS} hours.
									</li>
									<li>
										They sign in or create an account and join your organization with the chosen
										role.
									</li>
									<li>They only see this {type}, until someone gives them more.</li>
									<li>
										Until they accept, the invitation is listed under Manage access, where you can
										resend or revoke it.
									</li>
								</ul>
							{:else}
								<ul class="list-disc space-y-1 pl-4">
									<li>The link doesn't expire and works for any number of people.</li>
									<li>
										Whoever opens it signs in or creates an account and joins your organization with
										that role. People already in your organization keep their role and get access to
										this {type}.
									</li>
									<li>Anyone who has the link can join, so only send it to people you trust.</li>
									<li>
										Turning the link off or resetting it under Manage access stops new people from
										joining. Those who joined keep their access.
									</li>
								</ul>
							{/if}
						</InfoTip>
					</div>
					{#if tab === "members"}
						<OrgMemberInvite target={inviteTarget} />
					{:else if tab === "email"}
						<EmailInvite target={inviteTarget} />
					{:else}
						<LinkInvite target={inviteTarget} />
					{/if}
				</div>
			{:else}
				<ShareLinks exportId={targetQuery.current.id} onscreening={() => dialog?.close()} />
			{/if}
		{:else}
			<span class="loading mt-2 loading-spinner"></span>
		{/if}
	</div>
	<!-- The button is needed: tapping the backdrop submits this form, which closes the dialog -->
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
