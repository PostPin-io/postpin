<script lang="ts">
	import { contrastColor } from "./category-color.ts";

	interface Props {
		category: { name: string; color: string };
		class?: string;
		/** Show only a colored circle while the nearest `@container` is narrower than `@md`. */
		collapsible?: boolean;
	}
	let { category, class: classes = "", collapsible = false }: Props = $props();
</script>

<span
	class="badge badge-outline badge-xs {collapsible
		? '@max-md:size-4 @max-md:rounded-full @max-md:px-0'
		: ''} {classes}"
	style:background-color={category.color}
	style:border-color={category.color}
	style:color={contrastColor(category.color)}
	title={collapsible ? category.name : undefined}
>
	<span class={collapsible ? "@max-md:hidden" : ""}>{category.name}</span>
</span>
