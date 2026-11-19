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

	// the session check asks the server, which may be down, offline, or a wrong URL
	let authError = $state<string | null>(null);

	async function checkAuth() {
		loading = true;
		authError = null;
		try {
			loggedIn = !!(await host.getSession());
		} catch (error) {
			authError = `Can't reach the PostPin server at ${await host.getServerUrl()}: ${errorMessage(error)}`;
		}
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
{:else if authError}
	<DragBar />
	<div class="p-4 pt-10">
		<p>{authError}</p>
		<p class="text-sm opacity-70">Check that it's running and that you're online.</p>
		<div class="mt-2 flex gap-2">
			<button class="btn btn-sm" onclick={checkAuth}>Retry</button>
			<button class="btn btn-sm btn-ghost" onclick={() => host.logout()}>Logout</button>
		</div>
	</div>
{:else if loggedIn}
	<svelte:boundary>
		{#snippet failed(error: unknown, reset: () => void)}
			<DragBar />
			<div class="p-4 pt-10">
				An error occurred:<br />
				<pre class="whitespace-pre-wrap">{errorMessage(error)}</pre>
				<div class="flex gap-2">
					<button class="btn btn-sm" onclick={reset}>Restart</button>
					<button class="btn btn-sm btn-ghost" onclick={() => host.logout()}>Logout</button>
				</div>
			</div>
		{/snippet}
		<MainScreen {header} {titleBarInset} {fetch} />
	</svelte:boundary>
{:else}
	<DragBar />
	<Login />
{/if}
