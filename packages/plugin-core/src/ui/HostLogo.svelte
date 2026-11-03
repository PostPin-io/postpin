<script lang="ts">
	import { hostInfo } from "./hosts";

	interface Props {
		hostName: string;
		class?: string;
	}

	let { hostName, class: className = "" }: Props = $props();

	const info = $derived(hostInfo(hostName));
	const initials = $derived(
		info.displayName
			.split(" ")
			.map((word) => word[0])
			.join(""),
	);
</script>

{#if typeof info.logo === "string"}
	<img src={info.logo} alt={info.displayName} class={["object-contain", className]} />
{:else if info.logo}
	<svg
		viewBox={info.logo.viewBox}
		class={["fill-current", className]}
		role="img"
		aria-label={info.displayName}
	>
		<path d={info.logo.path} />
	</svg>
{:else}
	<!-- No logo yet for this host -->
	<span
		class={["flex items-center justify-center text-xs font-bold", className]}
		aria-label={info.displayName}
	>
		{initials}
	</span>
{/if}
