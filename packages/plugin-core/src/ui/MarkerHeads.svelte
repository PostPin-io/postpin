<script module lang="ts">
	// Colors from the PostPin logo, so the heads read as markers of different categories
	export const MARKER_HEAD_COLORS = ["#3d7fff", "#31b86a", "#e8559a"];
</script>

<script lang="ts">
	import Diamond from "@lucide/svelte/icons/diamond";

	interface Props {
		class?: string;
	}

	let { class: className = "" }: Props = $props();
</script>

<!-- The same diamond as a marker on the web app's timeline. Sized in em, so it follows the text. -->
<span class={["inline-flex shrink-0 items-center", className]} aria-hidden="true">
	{#each MARKER_HEAD_COLORS as color, i (color)}
		<Diamond class={["size-[1.1em]", i > 0 && "-ms-[0.35em]"]} fill={color} strokeWidth={0} />
	{/each}
</span>
