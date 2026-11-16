<script lang="ts">
	interface Props {
		/** File name in static/landing, without extension and without -light/-dark */
		name: string;
		alt: string;
		width: number;
		height: number;
		/** The screenshot exists as <name>-light.webp and <name>-dark.webp (web screenshots) */
		themed?: boolean;
		/** Load right away instead of when scrolled near (for the hero) */
		eager?: boolean;
		/** Full width of the parent instead of at most 60% of the screen height (/classic) */
		fullWidth?: boolean;
		class?: string;
	}
	let {
		name,
		alt,
		width,
		height,
		themed = false,
		eager = false,
		fullWidth = false,
		class: className = "",
	}: Props = $props();
</script>

<!-- Never taller than most of the screen, so a slide always shows the whole screenshot -->
<figure
	class="overflow-hidden rounded-box border border-base-300 bg-base-200 shadow-lg {fullWidth
		? ''
		: 'mx-auto w-fit max-w-full'} {className}"
>
	<picture>
		{#if themed}
			<source srcset="/landing/{name}-dark.webp" media="(prefers-color-scheme: dark)" />
		{/if}
		<img
			src={themed ? `/landing/${name}-light.webp` : `/landing/${name}.webp`}
			{alt}
			{width}
			{height}
			loading={eager ? "eager" : "lazy"}
			fetchpriority={eager ? "high" : "auto"}
			decoding="async"
			class="block h-auto {fullWidth ? 'w-full' : 'max-h-[60dvh] w-auto max-w-full'}"
		/>
	</picture>
</figure>
