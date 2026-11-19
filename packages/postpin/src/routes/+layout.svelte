<script lang="ts">
	import type { LayoutProps } from "./$types";

	import "./layout.css";
	import UploadIndicator from "#lib/components/exports/UploadIndicator.svelte";
	import HeldUploadPopover from "#lib/components/exports/HeldUploadPopover.svelte";
	import { initTheme } from "#lib/theme.svelte.ts";

	let { children }: LayoutProps = $props();

	initTheme();
</script>

<div class="h-full">
	{@render children()}
</div>
<UploadIndicator />
<HeldUploadPopover />
