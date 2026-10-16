<script lang="ts">
	import { getOrg } from "./members.remote";
	import { page } from "$app/state";
	import { authClient } from "#lib/auth-client.ts";

	const org = await getOrg(page.params.organization!);

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
</script>

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
							<select
								value={member.role}
								class="select"
								onchange={(e) => changeRole(member.id, e.currentTarget.value)}
								disabled={changingRoleOf === member.id}
							>
								<option value="owner">Owner</option>
								<option value="admin">Admin</option>
								<option value="member">Member</option>
							</select>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
