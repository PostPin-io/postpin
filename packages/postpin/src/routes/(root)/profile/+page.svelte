<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import { untrack } from "svelte";
	import { refreshAll } from "$app/navigation";
	import { authClient } from "#lib/auth-client.ts";
	import {
		getDeletionBlockers,
		getMemberships,
		getMyStorage,
		getProfile,
		getSessions,
		leaveOrganization,
		revokeSession,
	} from "./profile.remote.ts";
	import NewOrgModal from "../../../lib/components/organizations/NewOrgModal.svelte";
	import { roleLabel } from "#lib/roles.ts";
	import UsageBar from "#lib/components/storage/UsageBar.svelte";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";

	type Message = { type: "success" | "error"; text: string } | null;

	const profile = $derived(await getProfile());
	const memberships = $derived(await getMemberships());
	const sessions = $derived(await getSessions());
	const storage = $derived(await getMyStorage());

	let name = $state(untrack(() => profile.name));
	let savingName = $state(false);
	let nameMessage = $state<Message>(null);

	let newEmail = $state("");
	let savingEmail = $state(false);
	let emailMessage = $state<Message>(null);

	let currentPassword = $state("");
	let newPassword = $state("");
	let confirmPassword = $state("");
	let revokeOtherSessions = $state(true);
	let savingPassword = $state(false);
	let passwordMessage = $state<Message>(null);

	let leaving = $state<string | null>(null);
	let orgMessage = $state<Message>(null);

	let revoking = $state<string | null>(null);
	let sessionMessage = $state<Message>(null);

	async function saveName() {
		if (!name.trim()) {
			nameMessage = { type: "error", text: "Name can't be empty." };
			return;
		}

		savingName = true;
		nameMessage = null;
		const { error } = await authClient.updateUser({ name: name.trim() });
		savingName = false;

		if (error) {
			nameMessage = { type: "error", text: error.message ?? "Could not update your name." };
			return;
		}
		nameMessage = { type: "success", text: "Name updated." };
		await getProfile().refresh();
	}

	async function changeEmail() {
		const email = newEmail.trim();
		if (!email || email === profile.email) {
			emailMessage = { type: "error", text: "Enter a new email address." };
			return;
		}

		savingEmail = true;
		emailMessage = null;
		const { error } = await authClient.changeEmail({ newEmail: email, callbackURL: "/profile" });
		savingEmail = false;

		if (error) {
			emailMessage = { type: "error", text: error.message ?? "Could not change your email." };
			return;
		}

		newEmail = "";
		emailMessage = profile.emailVerified
			? { type: "success", text: `We sent a verification link to ${email}.` }
			: { type: "success", text: "Email updated." };
		await getProfile().refresh();
	}

	async function sendVerification() {
		emailMessage = null;
		const { error } = await authClient.sendVerificationEmail({
			email: profile.email,
			callbackURL: "/profile",
		});
		emailMessage = error
			? { type: "error", text: error.message ?? "Could not send verification email." }
			: { type: "success", text: `We sent a verification link to ${profile.email}.` };
	}

	async function changePassword() {
		if (!currentPassword || !newPassword) {
			passwordMessage = { type: "error", text: "Enter your current and new password." };
			return;
		}
		if (newPassword !== confirmPassword) {
			passwordMessage = { type: "error", text: "The new passwords don't match." };
			return;
		}

		savingPassword = true;
		passwordMessage = null;
		const { error } = await authClient.changePassword({
			currentPassword,
			newPassword,
			revokeOtherSessions,
		});
		savingPassword = false;

		if (error) {
			passwordMessage = { type: "error", text: error.message ?? "Could not change your password." };
			return;
		}

		currentPassword = newPassword = confirmPassword = "";
		passwordMessage = { type: "success", text: "Password changed." };
	}

	async function leaveOrg(org: { id: string; name: string }) {
		if (!confirm(`Leave ${org.name}? You'll lose access to its projects.`)) return;

		leaving = org.id;
		orgMessage = null;
		try {
			await leaveOrganization(org.id);
		} catch (e) {
			const text = (e as { body?: { message?: string } }).body?.message;
			orgMessage = { type: "error", text: text ?? "Could not leave the organization." };
			return;
		} finally {
			leaving = null;
		}

		orgMessage = { type: "success", text: `You left ${org.name}.` };
		// refresh first so hooks.server.ts picks a new active org before the session store refetches
		await refreshAll();
		// better-auth doesn't refresh these stores on leave; the navbar switcher reads them
		authClient.$store.notify("$listOrg");
		authClient.$store.notify("$sessionSignal");
	}

	async function signOutSession(id: string) {
		revoking = id;
		sessionMessage = null;
		try {
			await revokeSession(id);
		} catch {
			sessionMessage = { type: "error", text: "Could not sign out that session." };
		}
		revoking = null;
	}

	let dialog: NewOrgModal | null = null;

	const blockers = $derived(await getDeletionBlockers());
	let deleteDialog = $state<HTMLDialogElement>();
	let deletePassword = $state("");
	let deleting = $state(false);
	let deleteMessage = $state<Message>(null);

	async function deleteAccount() {
		if (!deletePassword) {
			deleteMessage = { type: "error", text: "Enter your password." };
			return;
		}
		deleting = true;
		deleteMessage = null;
		const { error } = await authClient.deleteUser({ password: deletePassword });
		deleting = false;
		if (error) {
			deleteMessage = { type: "error", text: error.message ?? "Could not delete your account." };
			return;
		}
		// full reload: the session cookie is gone, every cached query is stale
		window.location.href = "/auth/login";
	}
</script>

<PageMeta title="Profile" description="Manage your PostPin profile, organizations and sessions." />

{#snippet alert(message: Message, clear: () => void)}
	{#if message}
		<div
			class="alert alert-soft py-2 text-sm"
			class:alert-error={message.type === "error"}
			class:alert-success={message.type === "success"}
			role={message.type === "error" ? "alert" : "status"}
		>
			<span>{message.text}</span>
			<button class="btn btn-ghost btn-xs" aria-label="Close message" onclick={clear}>×</button>
		</div>
	{/if}
{/snippet}

<div class="flex flex-col gap-4 p-6">
	<header class="flex items-baseline justify-between gap-4">
		<h1 class="text-2xl font-bold">Profile</h1>
		<p class="text-sm text-base-content/70">
			Member since {new Date(profile.createdAt).toLocaleDateString()}
		</p>
	</header>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="flex flex-col gap-4">
			<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
				<legend class="fieldset-legend">Name</legend>
				{@render alert(nameMessage, () => (nameMessage = null))}
				<label class="label" for="profile-name">Display name</label>
				<div class="join w-full">
					<input
						id="profile-name"
						type="text"
						class="input join-item w-full input-sm"
						autocomplete="name"
						bind:value={name}
						onkeydown={(e) => e.key === "Enter" && saveName()}
						disabled={savingName}
					/>
					<button
						class="btn join-item btn-primary btn-sm"
						disabled={savingName || name.trim() === profile.name}
						onclick={saveName}
					>
						Save
						{#if savingName}<span class="loading loading-xs loading-spinner"></span>{/if}
					</button>
				</div>
			</fieldset>

			<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
				<legend class="fieldset-legend">Email</legend>
				{@render alert(emailMessage, () => (emailMessage = null))}
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span>{profile.email}</span>
					{#if profile.emailVerified}
						<span class="badge badge-soft badge-sm badge-success">Verified</span>
					{:else}
						<span class="badge badge-soft badge-sm badge-warning">Not verified</span>
						<button type="button" class="btn btn-link btn-xs" onclick={sendVerification}>
							Send verification email
						</button>
					{/if}
				</div>
				<label class="label" for="profile-email">New email address</label>
				<div class="join w-full">
					<input
						id="profile-email"
						type="email"
						class="input join-item w-full input-sm"
						autocomplete="email"
						placeholder="you@example.com"
						bind:value={newEmail}
						onkeydown={(e) => e.key === "Enter" && changeEmail()}
						disabled={savingEmail}
					/>
					<button
						class="btn join-item btn-primary btn-sm"
						disabled={savingEmail || !newEmail.trim()}
						onclick={changeEmail}
					>
						Change
						{#if savingEmail}<span class="loading loading-xs loading-spinner"></span>{/if}
					</button>
				</div>
				{#if profile.emailVerified}
					<p class="label">We'll send a verification link to the new address first.</p>
				{/if}
			</fieldset>
		</div>

		<fieldset class="fieldset h-full rounded-box border border-base-300 bg-base-100 p-4">
			<legend class="fieldset-legend">Password</legend>
			{@render alert(passwordMessage, () => (passwordMessage = null))}
			<label class="label" for="current-password">Current password</label>
			<input
				id="current-password"
				type="password"
				class="input w-full input-sm"
				autocomplete="current-password"
				bind:value={currentPassword}
				onkeydown={(e) => e.key === "Enter" && changePassword()}
				disabled={savingPassword}
			/>
			<label class="label" for="new-password">New password</label>
			<input
				id="new-password"
				type="password"
				class="input w-full input-sm"
				autocomplete="new-password"
				bind:value={newPassword}
				onkeydown={(e) => e.key === "Enter" && changePassword()}
				disabled={savingPassword}
			/>
			<label class="label" for="confirm-password">Confirm new password</label>
			<input
				id="confirm-password"
				type="password"
				class="input w-full input-sm"
				autocomplete="new-password"
				bind:value={confirmPassword}
				onkeydown={(e) => e.key === "Enter" && changePassword()}
				disabled={savingPassword}
			/>
			<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
				<label class="label">
					<input type="checkbox" class="checkbox checkbox-xs" bind:checked={revokeOtherSessions} />
					Sign out other devices
				</label>
				<button class="btn btn-primary btn-sm" onclick={changePassword} disabled={savingPassword}>
					Change password
					{#if savingPassword}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			</div>
		</fieldset>
	</div>

	<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
		<legend class="fieldset-legend">Active Sessions</legend>
		{@render alert(sessionMessage, () => (sessionMessage = null))}
		<div class="overflow-x-auto">
			<table class="table w-full table-sm">
				<thead>
					<tr>
						<th>Device</th>
						<th>IP address</th>
						<th>Last active</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each sessions as session (session.id)}
						<tr>
							<td>
								<div class="font-medium">
									{session.app}
									{#if session.current}<span class="badge badge-sm badge-primary">This device</span
										>{/if}
								</div>
								{#if session.deviceName}
									<div class="text-xs text-base-content/70">{session.deviceName}</div>
								{/if}
							</td>
							<td class="font-mono text-xs">{session.ipAddress ?? "–"}</td>
							<td title={`Signed in ${session.createdAt.toLocaleString()}`}>
								{session.lastActive.toLocaleString()}
							</td>
							<td class="text-right">
								{#if !session.current}
									<button
										type="button"
										class="btn btn-ghost text-error btn-xs"
										disabled={revoking !== null}
										onclick={() => signOutSession(session.id)}
									>
										Sign out
										{#if revoking === session.id}<span class="loading loading-xs loading-spinner"
											></span>{/if}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</fieldset>

	<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
		<legend class="fieldset-legend">Organizations</legend>
		{@render alert(orgMessage, () => (orgMessage = null))}
		<ul class="divide-y divide-base-200">
			{#each memberships as org (org.id)}
				<li class="flex items-center justify-between gap-2 py-1.5">
					<div class="flex items-center gap-2 text-sm">
						<a class="link font-medium link-hover" href={`/organizations/${org.slug}`}>{org.name}</a
						>
						<span class="badge badge-ghost badge-sm">{roleLabel(org.role)}</span>
					</div>
					<button
						type="button"
						class="btn btn-ghost text-error btn-xs"
						disabled={leaving !== null}
						onclick={() => leaveOrg(org)}
					>
						Leave
						{#if leaving === org.id}<span class="loading loading-xs loading-spinner"></span>{/if}
					</button>
				</li>
			{:else}
				<li class="py-1.5 text-sm text-base-content/70">
					You're not a member of any organizations yet.
				</li>
			{/each}
		</ul>
		<div>
			<button class="btn btn-sm" onclick={() => dialog?.open()}> Create new organization </button>
		</div>
	</fieldset>

	<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
		<legend class="fieldset-legend">Storage</legend>
		<UsageBar used={storage.used} quota={storage.quota} />
		<p class="label">Exports you uploaded, with their proxies and images, in all organizations.</p>
		{#if storage.organizations.length > 0}
			<table class="table table-sm">
				<thead>
					<tr>
						<th>Organization</th>
						<th class="text-right">Your uploads</th>
						<th class="text-right">You can still upload</th>
					</tr>
				</thead>
				<tbody>
					{#each storage.organizations as org (org.id)}
						<tr>
							<td>{org.name}</td>
							<td class="text-right tabular-nums">{formatByteSize(org.used)}</td>
							<td class="text-right tabular-nums">
								{org.left === null ? "Unlimited" : formatByteSize(org.left)}
								{#if org.limitedBy === "organization"}
									<div class="text-xs opacity-60">limited by the organization</div>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</fieldset>

	<fieldset class="fieldset rounded-box border border-error/40 bg-base-100 p-4">
		<legend class="fieldset-legend text-error">Delete account</legend>
		<p class="text-sm text-base-content/70">
			Deletes your account, your sessions and your memberships right away. Markers, comments and
			exports you created stay with their organization and show as “Deleted User”.
		</p>
		{#if blockers.length > 0}
			<p class="text-sm text-warning">
				You're the last owner of {blockers.map((b) => b.name).join(", ")}. Make someone else owner
				or delete the organization first.
			</p>
		{/if}
		<div>
			<button
				type="button"
				class="btn btn-outline btn-error btn-sm"
				disabled={blockers.length > 0}
				onclick={() => {
					deletePassword = "";
					deleteMessage = null;
					deleteDialog?.showModal();
				}}
			>
				Delete account…
			</button>
		</div>
	</fieldset>
</div>

<dialog bind:this={deleteDialog} class="modal">
	<form
		class="modal-box flex flex-col gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			deleteAccount();
		}}
	>
		<h3 class="text-lg font-bold">Delete your account?</h3>
		<p class="text-sm">
			This can't be undone. Markers and comments you wrote stay with their organization and show as
			“Deleted User”.
		</p>
		{@render alert(deleteMessage, () => (deleteMessage = null))}
		<label class="label" for="delete-password">Confirm with your password</label>
		<input
			id="delete-password"
			type="password"
			class="input w-full input-sm"
			autocomplete="current-password"
			bind:value={deletePassword}
			disabled={deleting}
		/>
		<div class="modal-action">
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => deleteDialog?.close()}>
				Cancel
			</button>
			<button type="submit" class="btn btn-error btn-sm" disabled={deleting || !deletePassword}>
				Delete account
				{#if deleting}<span class="loading loading-xs loading-spinner"></span>{/if}
			</button>
		</div>
	</form>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<NewOrgModal bind:this={dialog} />
