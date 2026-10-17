<script lang="ts">
	import { untrack } from "svelte";
	import { refreshAll } from "$app/navigation";
	import { authClient } from "#lib/auth-client.ts";
	import { getMemberships, getProfile } from "./profile.remote.ts";
	import NewOrgModal from "../../../lib/components/NewOrgModal.svelte";

	type Message = { type: "success" | "error"; text: string } | null;

	const profile = $derived(await getProfile());

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
		const { error } = await authClient.organization.leave({ organizationId: org.id });
		leaving = null;

		if (error) {
			orgMessage = { type: "error", text: error.message ?? "Could not leave the organization." };
			return;
		}

		orgMessage = { type: "success", text: `You left ${org.name}.` };
		// refresh first so hooks.server.ts picks a new active org before the session store refetches
		await refreshAll();
		// better-auth doesn't refresh these stores on leave; the navbar switcher reads them
		authClient.$store.notify("$listOrg");
		authClient.$store.notify("$sessionSignal");
	}

	let dialog: NewOrgModal | null = null;
</script>

<svelte:head>
	<title>Profile | PostPin</title>
</svelte:head>

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
		<legend class="fieldset-legend">Organizations</legend>
		{@render alert(orgMessage, () => (orgMessage = null))}
		{#await getMemberships() then memberships}
			<ul class="divide-y divide-base-200">
				{#each memberships as org (org.id)}
					<li class="flex items-center justify-between gap-2 py-1.5">
						<div class="flex items-center gap-2 text-sm">
							<a class="link font-medium link-hover" href={`/organizations/${org.slug}`}
								>{org.name}</a
							>
							<span class="badge badge-ghost badge-sm">{org.role}</span>
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
		{/await}
	</fieldset>
</div>

<NewOrgModal bind:this={dialog} />
