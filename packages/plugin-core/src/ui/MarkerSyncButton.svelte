<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ArrowRight from "@lucide/svelte/icons/arrow-right";
	import Diamond from "@lucide/svelte/icons/diamond";
	import MonitorPlay from "@lucide/svelte/icons/monitor-play";
	import HostLogo from "./HostLogo.svelte";
	import { hostInfo } from "./hosts";
	import { MARKER_HEAD_COLORS } from "./MarkerHeads.svelte";
	import PostPinLogo from "./PostPinLogo.svelte";

	interface Props {
		// where the markers come from: "nle" syncs them up to PostPin, "postpin" down to the NLE
		from: "nle" | "postpin";
		// Capabilities.hostName, null until the NLE has answered once
		hostName: string | null;
		// this sync is running: shows the markers travelling instead of the arrow
		busy?: boolean;
		disabled?: boolean;
		onclick: () => void;
		/** data-guide anchor for the web app's plugin tutorial */
		guide?: string;
	}

	let { from, hostName, busy = false, disabled = false, onclick, guide }: Props = $props();

	const hostLabel = $derived(hostName ? hostInfo(hostName).displayName : "your editing app");
	// The logos alone don't say what happens, so the label spells it out for tooltips and screen readers
	const label = $derived(
		from === "nle"
			? `Sync markers from ${hostLabel} to PostPin`
			: `Sync markers from PostPin to ${hostLabel}`,
	);
</script>

{#snippet postPin()}
	<PostPinLogo class="h-[0.9lh] w-[1lh] shrink-0" />
{/snippet}

{#snippet nle()}
	{#if hostName}
		<HostLogo {hostName} class="size-[1lh] shrink-0" />
	{:else}
		<MonitorPlay class="size-[1lh] shrink-0" aria-hidden="true" />
	{/if}
{/snippet}

<!-- The NLE always left and PostPin right, like the boxes in the wide layout, only the arrow and
     the travelling markers change direction. So both buttons line up logo under logo. -->
<button
	type="button"
	class="btn flex-nowrap gap-2"
	aria-label={label}
	aria-busy={busy}
	title={label}
	data-guide={guide}
	{disabled}
	onclick={() => {
		if (!busy) onclick();
	}}
>
	{@render nle()}
	<span class="relative flex h-[1lh] w-8 shrink-0 items-center justify-center" aria-hidden="true">
		{#if busy}
			{#each MARKER_HEAD_COLORS as color, i (color)}
				<!-- full track width, so translating by ±50% moves the head from one end to the other -->
				<span
					class={[
						"travel absolute inset-0 flex items-center justify-center",
						from === "postpin" && "leftwards",
					]}
					style:--i={i}
				>
					<Diamond class="size-2.5" fill={color} strokeWidth={0} />
				</span>
			{/each}
		{:else}
			{#if from === "nle"}
				<ArrowRight class="size-4" />
			{:else}
				<ArrowLeft class="size-4" />
			{/if}
		{/if}
	</span>
	{@render postPin()}
</button>

<style>
	.travel {
		opacity: 0;
		animation: travel 1.2s linear infinite;
		animation-delay: calc(var(--i) * 0.4s);
	}

	/* down to the NLE, which sits left */
	.leftwards {
		animation-direction: reverse;
	}

	@keyframes travel {
		0% {
			transform: translateX(-50%);
			opacity: 0;
		}
		15%,
		85% {
			opacity: 1;
		}
		100% {
			transform: translateX(50%);
			opacity: 0;
		}
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}

	/* No movement: the heads sit side by side and pulse one after another */
	@media (prefers-reduced-motion: reduce) {
		.travel {
			transform: translateX(calc((var(--i) - 1) * 30%));
			animation-name: pulse;
		}
	}
</style>
