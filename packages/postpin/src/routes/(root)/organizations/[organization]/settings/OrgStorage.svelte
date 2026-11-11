<script lang="ts">
	import { resolve } from "$app/paths";
	import UsageBar from "#lib/components/storage/UsageBar.svelte";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import { getOrganizationStorage } from "./settings.remote.ts";

	let { organizationId }: { organizationId: string } = $props();

	const storage = $derived(await getOrganizationStorage(organizationId));
</script>

<fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-4">
	<legend class="fieldset-legend">Storage</legend>
	<UsageBar used={storage.used} quota={storage.quota} />
	<p class="label">
		Originals with their proxies and images. The limit is set by the administrator of this PostPin
		instance.
	</p>

	{#if storage.projects.length > 0}
		<div class="mt-2 grid gap-6 md:grid-cols-2">
			<table class="table table-sm">
				<thead><tr><th>Project</th><th class="text-right">Storage</th></tr></thead>
				<tbody>
					{#each storage.projects as project (project.id)}
						<tr>
							<td>
								<a
									class="link link-hover"
									href={resolve("/(root)/projects/[project]", { project: project.id })}
									>{project.name}</a
								>
							</td>
							<td class="text-right tabular-nums">{formatByteSize(project.used)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<table class="table table-sm">
				<thead><tr><th>Uploaded by</th><th class="text-right">Storage</th></tr></thead>
				<tbody>
					{#each storage.uploaders as uploader (uploader.id)}
						<tr>
							<td>{uploader.name}</td>
							<td class="text-right tabular-nums">{formatByteSize(uploader.used)}</td>
						</tr>
					{/each}
					{#if storage.unattributed > 0n}
						<tr>
							<td class="opacity-60">Unknown</td>
							<td class="text-right tabular-nums">{formatByteSize(storage.unattributed)}</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</fieldset>
