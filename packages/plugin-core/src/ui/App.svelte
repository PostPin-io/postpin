<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HostBridge, NleBridge } from "../bridge";
	import { setBridges } from "./context";
	import Login from "./Login.svelte";
	import MainScreen from "./MainScreen.svelte";
	import DragBar from "./DragBar.svelte";
	import { errorMessage } from "../errors";

	interface Props {
		nle: NleBridge;
		host: HostBridge;
		// host app content above the main screen, e.g. the connected NLE in PostPin Desktop
		header?: Snippet;
		// room for the window buttons of a hidden title bar, off in host panels like Premiere's
		titleBarInset?: boolean;
		// fetch for the API client, e.g. Premiere's webview, where macOS blocks http and CORS applies
		fetch?: typeof globalThis.fetch;
	}

	let { nle, host, header, titleBarInset = true, fetch }: Props = $props();

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
	<DragBar />
	<main class="w-screen h-screen flex items-center justify-center">
		<span class="loading loading-lg loading-spinner"></span>
	</main>
{:else if loggedIn}
	<svelte:boundary>
		{#snippet failed(error: unknown, reset: () => void)}
			<DragBar />
			<div class="p-4 pt-10">
				An error occurred:<br />
				<pre class="whitespace-pre-wrap">{errorMessage(error)}</pre>
				<button class="btn btn-sm" onclick={reset}>Restart</button>
			</div>
		{/snippet}
		<MainScreen {header} {titleBarInset} {fetch} />
	</svelte:boundary>
{:else}
	<DragBar />
	<Login />
{/if}
