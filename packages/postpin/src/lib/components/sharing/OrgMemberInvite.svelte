<script lang="ts">
	import { authClient } from "#lib/auth-client.ts";
	import { remoteErrorMessage } from "#lib/remote-error.ts";
	import { roleAllows, toRole } from "#lib/roles.ts";
	import { addGrant, getTargetAccess } from "./grants.remote";

	interface Props {
		target: { type: "project" | "timeline"; id: string };
	}
	let { target }: Props = $props();

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	// Reviewers never get a request; members without a matching grant land in access.error
	const mayGrant = $derived(role ? roleAllows(role, "grant", "create") : false);
	const access = $derived(mayGrant ? getTargetAccess(target) : undefined);

	let search = $state("");
	let busy = $state(false);
	let message = $state<{ text: string; error: boolean } | null>(null);

	const candidates = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const all = access?.current?.candidates ?? [];
		return q
			? all.filter(
					(m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
				)
			: all;
	});

	async function add(member: { id: string; user: { name: string } }) {
		busy = true;
		message = null;
		try {
			await addGrant({ memberId: member.id, target });
			await access?.refresh();
			message = { text: `${member.user.name} now has access.`, error: false };
		} catch (e) {
			message = {
				text: `Could not add ${member.user.name}: ${remoteErrorMessage(e)}`,
				error: true,
			};
		}
		busy = false;
	}
</script>

{#if !mayGrant || access?.error}
	<p class="text-sm text-base-content/60">
		You can't add people from your organization to this {target.type}.
	</p>
{:else if access?.current}
	{#if access.current.candidates.length === 0}
		<p class="text-sm text-base-content/60">
			Everyone in your organization already has access to this {target.type}.
		</p>
	{:else}
		{#if access.current.candidates.length > 5}
			<input
				type="search"
				placeholder="Search by name or e-mail"
				aria-label="Search people in your organization"
				class="input w-full input-sm"
				bind:value={search}
			/>
		{/if}
		<ul class="flex max-h-64 flex-col overflow-y-auto">
			{#each candidates as m (m.id)}
				<li class="flex items-center gap-2 rounded-box px-1 py-1.5 hover:bg-base-200">
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm">{m.user.name}</p>
						<p class="truncate text-xs text-base-content/60">{m.user.email}</p>
					</div>
					<button
						type="button"
						class="btn btn-outline btn-primary btn-xs"
						disabled={busy}
						onclick={() => add(m)}>Add</button
					>
				</li>
			{:else}
				<li class="px-1 py-1.5 text-sm text-base-content/60">Nobody matches your search.</li>
			{/each}
		</ul>
	{/if}
	{#if message}
		<p class="text-sm {message.error ? 'text-error' : 'text-success'}">{message.text}</p>
	{/if}
{:else}
	<span class="loading loading-sm loading-spinner"></span>
{/if}
