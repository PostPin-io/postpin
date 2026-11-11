<script lang="ts">
	import { resolve } from "$app/paths";
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import QuotaCell from "#lib/components/storage/QuotaCell.svelte";
	import UsageBar from "#lib/components/storage/UsageBar.svelte";
	import { listOrganizations, setOrgQuota } from "../storage.remote";
</script>

<PageMeta title="Organizations" description="All organizations with their storage usage." />

<div class="overflow-x-auto">
	<table class="table">
		<thead>
			<tr>
				<th>Name</th>
				<th class="text-right">Members</th>
				<th>Storage</th>
				<th>Quota</th>
			</tr>
		</thead>
		<tbody>
			{#each await listOrganizations() as org (org.id)}
				<tr>
					<td>
						<a
							class="link font-medium link-hover"
							href={resolve("/(root)/organizations/[organization]/settings", {
								organization: org.slug,
							})}>{org.name}</a
						>
						<div class="font-mono text-xs opacity-50">{org.slug}</div>
					</td>
					<td class="text-right tabular-nums">{org.members}</td>
					<td><UsageBar used={org.used} quota={org.quota} /></td>
					<td>
						<QuotaCell
							quota={org.quota}
							quotaOverride={org.quotaOverride}
							save={(quota) => setOrgQuota({ id: org.id, quota })}
						/>
					</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="py-8 text-center text-sm opacity-50">No organizations</td></tr>
			{/each}
		</tbody>
	</table>
</div>
