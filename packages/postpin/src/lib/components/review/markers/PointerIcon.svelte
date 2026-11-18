<script lang="ts">
	// PostPin's own pointer icon (a cursor at the end of a curve), drawn like the Lucide icons around it
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 24, class: classes = "" }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={classes}
	aria-hidden="true"
>
	<path
		d="M18.204 17.545a1 1 0 00-.66.66l-1.067 3.443a.5.5 0 01-.943.033l-3.5-9a.498.498 0 01.647-.647l9 3.5a.5.5 0 01-.033.943z"
	/>
	<path d="M5 17a2 2 0 11-2 2 2 2 0 012-2A12 12 0 0117 5" />
	<circle cx="19" cy="5" r="2" />
</svg>
