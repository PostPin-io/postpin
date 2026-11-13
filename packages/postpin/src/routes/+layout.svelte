<script lang="ts">
	import type { LayoutProps } from "./$types";

	import "./layout.css";
	import UploadIndicator from "#lib/components/exports/UploadIndicator.svelte";

	let { children }: LayoutProps = $props();
</script>

<div class="h-full">
	{@render children()}
</div>
<UploadIndicator />
