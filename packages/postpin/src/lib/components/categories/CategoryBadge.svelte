<script lang="ts">
	import { contrastColor } from "./category-color.ts";

	interface Props {
		category: { name: string; color: string };
		class?: string;
		/** Only a colored circle; the name stays in the tooltip */
		collapsed?: boolean;
	}
	let { category, class: classes = "", collapsed = false }: Props = $props();
</script>

<span
	class="badge max-w-full badge-outline badge-xs {collapsed
		? 'size-4 rounded-full px-0'
		: ''} {classes}"
	style:background-color={category.color}
	style:border-color={category.color}
	style:color={contrastColor(category.color)}
	title={category.name}
>
	{#if !collapsed}<span class="min-w-0 truncate">{category.name}</span>{/if}
</span>
