<script lang="ts">
	import type { LayoutProps } from "./$types";

	import "./layout.css";

	let { children }: LayoutProps = $props();
</script>

<div>
	{@render children()}

	<footer class="mx-auto max-w-4xl px-4 py-8 text-center text-sm text-gray-500">
		<p>&copy; 2026 PostPin Team</p>
	</footer>
</div>
