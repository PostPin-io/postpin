<script lang="ts">
	import type { SVGAttributes } from "svelte/elements";

	let { ...props }: SVGAttributes<SVGSVGElement> = $props();
</script>

<!-- The center bar uses currentColor so the logo adapts to light and dark themes. -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 1876 1669"
	fill="none"
	stroke-width="150"
	stroke-linecap="round"
	aria-hidden="true"
	{...props}
>
	<path d="M75 1594V1082" stroke="#3d7fff" />
	<path d="M363 1594V862" stroke="#21b8cf" />
	<path d="M650 1594V1221" stroke="#31b86a" />
	<path d="M938 1594V501" stroke="currentColor" />
	<path d="M1226 1594V946" stroke="#f5b92f" />
	<path d="M1513 1594V1139" stroke="#e8559a" />
	<path d="M1801 1594V1003" stroke="#8a63d2" />
	<circle cx="938" cy="250" r="175" stroke="#e8461d" stroke-width="151" />
</svg>
