<script lang="ts">
	import { getExports } from "@postpin-io/api-client-ts";
	import type { Client } from "@postpin-io/api-client-ts/client";

	interface Props {
		client: Client;
		projectId: string;
		timelineId: string;
		exportId: string | null;
	}

	let { client, projectId, timelineId, exportId = $bindable() }: Props = $props();
</script>

<select bind:value={exportId} class="select">
	{#each (await getExports({ client, path: { projectId, timelineId } })).data!.exports as timelineExport}
		<option value={timelineExport.id}>{timelineExport.createdAt}</option>
	{:else}
		<option disabled>No exports found</option>
	{/each}
</select>
