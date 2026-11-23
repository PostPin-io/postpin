<script lang="ts">
	import type { LayoutProps } from "./$types";
	import Footer from "#lib/components/layout/Footer.svelte";
	import Logo from "#lib/components/layout/Logo.svelte";
	let { children }: LayoutProps = $props();
</script>

<div class="bg-base-400 flex min-h-dvh flex-col">
	<main class="flex flex-1 items-center justify-center px-4 py-12">
		<section class="card w-full max-w-[30rem] border border-base-300 bg-base-100 shadow-sm">
			<!-- one gap for every page: pages render header, form and footer link as direct children -->
			<div class="card-body gap-6 p-8 sm:p-10">
				<a href="/" class="mx-auto" aria-label="PostPin home">
					<Logo class="h-16 w-auto" />
				</a>
				{@render children()}
			</div>
		</section>
	</main>
	<Footer />
</div>
