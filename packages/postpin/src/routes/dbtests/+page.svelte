<script lang="ts">
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
</script>

Ich habe folgende Daten vom Server erhalten: {data.users.length} User{#if data.users.length != 1}s{/if}

Das sind die User: {#each data.users as user (user.id)}
	<div>{user.name}</div>
{/each}
