<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import { GUIDE_STYLE } from "#lib/guides.ts";
	import { guideFeedback } from "./guide-feedback.svelte.ts";
	import { moveInto, topLayer } from "./top-layer.ts";

	const message = $derived(guideFeedback.message);

	// Above an open dialog too: the confirmation often belongs to something done in one.
	// Svelte only removes the node where it put it, so the cleanup does it once it moved.
	function followTopLayer(node: HTMLElement) {
		moveInto(node, topLayer());
		const timer = setInterval(() => moveInto(node, topLayer()), 250);
		return () => {
			clearInterval(timer);
			node.remove();
		};
	}
</script>

{#if message}
	{#key message.id}
		<div
			class="pointer-events-none fixed inset-x-0 bottom-6 z-[1001] flex justify-center px-4"
			role="status"
			aria-live="polite"
			{@attach followTopLayer}
		>
			<div
				class="flex items-center gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3 font-medium shadow-xl ring-2 {GUIDE_STYLE[
					message.type
				].ring}"
			>
				<CircleCheck class="size-5 shrink-0 text-success" />
				{message.text}
			</div>
		</div>
	{/key}
{/if}
