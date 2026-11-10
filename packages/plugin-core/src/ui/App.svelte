<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HostBridge, NleBridge } from "../bridge";
	import { setBridges } from "./context";
	import Login from "./Login.svelte";
	import MainScreen from "./MainScreen.svelte";
	import { errorMessage } from "../errors";

	interface Props {
		nle: NleBridge;
		host: HostBridge;
		// host app content above the main screen, e.g. the connected NLE in PostPin Desktop
		header?: Snippet;
	}

	let { nle, host, header }: Props = $props();

	// The bridges don't change during the app's lifetime
	// svelte-ignore state_referenced_locally
	setBridges({ nle, host });

	let loading = $state(true);
	let loggedIn = $state(false);

	async function checkAuth() {
		const session = await host.getSession();
		loggedIn = !!session;
		loading = false;
	}

	checkAuth();

	// svelte-ignore state_referenced_locally
	host.onSessionChanged(() => {
		window.location.reload();
	});
</script>

{#if loading}
	<main class="w-screen h-screen flex items-center justify-center">
		<span class="loading loading-lg loading-spinner"></span>
	</main>
{:else if loggedIn}
	<svelte:boundary>
		{#snippet failed(error: unknown, reset: () => void)}
			An error occurred:<br />
			<pre class="whitespace-pre-wrap">{errorMessage(error)}</pre>
			<button class="btn btn-sm" onclick={reset}>Restart</button>
		{/snippet}
		<MainScreen {header} />
	</svelte:boundary>
{:else}
	<Login />
{/if}
