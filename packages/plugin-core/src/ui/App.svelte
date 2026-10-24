<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HostBridge, NleBridge } from "../bridge";
	import { setBridges } from "./context";
	import Login from "./Login.svelte";
	import MainScreen from "./MainScreen.svelte";

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
	<MainScreen {header} />
{:else}
	<Login />
{/if}
