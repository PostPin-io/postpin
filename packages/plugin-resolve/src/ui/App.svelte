<script lang="ts">
	import MainScreen from "./MainScreen.svelte";
	import LoginScreen from "./Login.svelte";
	import { MainAPI } from "../ipc/renderer/PostPinResolveAPI";

	let loading = $state(true);
	let loggedIn = $state(false);

	async function checkAuth() {
		const session = await MainAPI!.getSession!();
		console.log("Session:", session);
		if (session) {
			loggedIn = true;
		} else {
			loggedIn = false;
		}
		loading = false;
	}

	checkAuth();

	MainAPI!.onSessionChanged!(() => {
		window.location.reload();
	});
</script>

{#if loading}
	<main class="w-screen h-screen flex items-center justify-center">
		<span class="loading loading-lg loading-spinner"></span>
	</main>
{:else if loggedIn}
	<MainScreen />
{:else}
	<LoginScreen />
{/if}
