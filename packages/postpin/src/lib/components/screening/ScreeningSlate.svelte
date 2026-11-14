<script lang="ts">
	import QRCode from "qrcode";
	import Logo from "#lib/components/layout/Logo.svelte";

	interface Props {
		/** The screening link the guests open */
		url: string;
		exportName: string;
	}
	let { url, exportName }: Props = $props();

	let image = $state<string | null>(null);
	$effect(() => {
		let cancelled = false;
		// Large: it is read from the back of the room off a projector
		QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }).then((data) => {
			if (!cancelled) image = data;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<!-- Stands in front of the video like a slate: shown instead of it, never burned into a frame -->
<div
	class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[3vh] bg-black p-[4vh] text-center text-white"
>
	<div class="flex items-center gap-3 text-[2.5vh] font-semibold text-white/70">
		<Logo class="h-[3vh] w-auto" /> PostPin
	</div>
	<h1 class="text-[5vh] leading-tight font-bold">Join the review</h1>
	{#if image}
		<img
			src={image}
			alt="QR code to join the review"
			class="aspect-square h-[48vh] rounded-[1.5vh] bg-white"
		/>
	{:else}
		<div class="aspect-square h-[48vh] rounded-[1.5vh] bg-white/10"></div>
	{/if}
	<p class="max-w-[80vw] text-[2.6vh] text-white/80">
		Scan the code with your phone to leave your notes on
		<span class="font-semibold text-white">{exportName}</span>
	</p>
</div>
