<script lang="ts">
	// The outlined "share" arrow: a curved tail from the bottom left into an arrowhead pointing
	// right. Lucide has none like it; drawn on its 24px grid with its stroke, so it sits among them.
	let { class: className = "" }: { class?: string } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<path d="M14 3.5 22 10.5 14 17.5V13C9.5 12.5 6 14.5 4.5 20.5 3.5 13.5 7.5 8.5 14 8Z" />
</svg>
