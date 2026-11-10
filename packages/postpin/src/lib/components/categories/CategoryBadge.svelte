<script lang="ts">
	interface Props {
		category: { name: string; color: string };
		class?: string;
	}
	let { category, class: classes = "" }: Props = $props();

	// Pick black or white text depending on the perceived brightness of the category color
	function textColor(hex: string) {
		const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
		if (!m) return undefined;
		const n = parseInt(m[1], 16);
		const luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
		return luminance > 150 ? "#000000" : "#ffffff";
	}
</script>

<span
	class="badge badge-outline badge-xs {classes}"
	style:background-color={category.color}
	style:border-color={category.color}
	style:color={textColor(category.color)}
>
	{category.name}
</span>
