<script lang="ts">
	import X from "@lucide/svelte/icons/x";

	interface Props {
		note: string;
		onclose: () => void;
	}
	let { note, onclose }: Props = $props();
</script>

<!-- Plain text: Svelte escapes it, whitespace-pre-line keeps the line breaks -->
<div
	class="absolute top-3 left-3 z-10 max-h-[60%] w-[min(24rem,calc(100%-1.5rem))] overflow-auto rounded-box bg-base-100/90 p-3 pr-9 text-sm whitespace-pre-line shadow backdrop-blur"
	role="note"
>
	{note}
	<button
		class="btn absolute top-1 right-1 btn-square btn-ghost btn-xs"
		aria-label="Hide note"
		onclick={onclose}
	>
		<X size={14} />
	</button>
</div>
