<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import QuotaCell from "#lib/components/storage/QuotaCell.svelte";
	import UsageBar from "#lib/components/storage/UsageBar.svelte";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import { listUsers, setUserQuota } from "../storage.remote";
</script>

<PageMeta title="Users" description="All users with the storage of their uploads." />

<div class="overflow-x-auto">
	<table class="table">
		<thead>
			<tr>
				<th>Name</th>
				<th>Organizations</th>
				<th>Uploads</th>
				<th>Quota</th>
			</tr>
		</thead>
		<tbody>
			{#each await listUsers() as user (user.id)}
				<tr>
					<td>
						<div class="font-medium">{user.name}</div>
						<div class="text-xs opacity-60">{user.email}</div>
					</td>
					<td>
						<div class="flex flex-wrap gap-1">
							{#each user.organizations as org (org.id)}
								<span class="badge badge-soft badge-sm">{org.name}</span>
							{:else}
								<span class="text-xs opacity-50">None</span>
							{/each}
						</div>
					</td>
					<td><UsageBar used={user.used} quota={user.quota} /></td>
					<td>
						<QuotaCell
							quota={user.quota}
							quotaOverride={user.quotaOverride}
							save={(quota) => setUserQuota({ id: user.id, quota })}
						/>
						{#if user.unusable}
							<p class="mt-1 max-w-48 text-xs text-warning">
								{formatByteSize(user.unusable)} more than all their organizations allow together
							</p>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="py-8 text-center text-sm opacity-50">No users</td></tr>
			{/each}
		</tbody>
	</table>
</div>
