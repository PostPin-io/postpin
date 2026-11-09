<script lang="ts">
	import type { HostBridge, NleBridge } from "@postpin-io/plugin-core/bridge";
	import App from "@postpin-io/plugin-core/ui/App.svelte";
	import HostPicker from "./HostPicker.svelte";

	interface Props {
		nle: NleBridge;
		host: HostBridge;
	}

	let { nle, host }: Props = $props();
</script>

<App {nle} {host}>
	{#snippet header()}
		<HostPicker />
	{/snippet}
</App>
