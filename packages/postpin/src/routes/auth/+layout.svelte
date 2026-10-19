<script lang="ts">
	import type { LayoutProps } from "./$types";
	import Footer from "#lib/components/Footer.svelte";
	let { children }: LayoutProps = $props();
</script>

<main class="flex min-h-[60vh] items-center justify-center py-12">
	<section class="card w-full max-w-md bg-base-100 shadow-xl">
		<div class="card-body gap-6 p-8 sm:p-10">
			<main class="mx-auto max-w-4xl px-4 py-8">
				{@render children()}
			</main>
		</div>
	</section>
</main>
<Footer />
