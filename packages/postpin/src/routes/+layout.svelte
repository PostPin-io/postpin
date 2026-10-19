<script lang="ts">
	import type { LayoutProps } from "./$types";

	import "./layout.css";

	let { children }: LayoutProps = $props();
</script>

<div class="h-full">
	{@render children()}
</div>
