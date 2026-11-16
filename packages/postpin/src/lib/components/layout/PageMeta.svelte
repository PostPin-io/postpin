<script lang="ts">
	import { page } from "$app/state";

	const DEFAULT_DESCRIPTION =
		"Your intuitive, easy and selfhosted video review and marker management tool";

	type Image = { src: string; width: number; height: number; alt: string };

	let {
		title,
		description = DEFAULT_DESCRIPTION,
		image,
		canonical = false,
	}: {
		title?: string;
		description?: string;
		/** link preview image (og:image), path below static/; previews need an absolute URL */
		image?: Image;
		/** marks this page's URL as canonical (og:url, rel=canonical), for public pages only */
		canonical?: boolean;
	} = $props();

	const fullTitle = $derived(title ? `${title} | PostPin` : "PostPin");
	const url = $derived(page.url.origin + page.url.pathname);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	{#if canonical}
		<link rel="canonical" href={url} />
		<meta property="og:url" content={url} />
	{/if}
	{#if image}
		<meta property="og:image" content={new URL(image.src, page.url.origin).href} />
		<meta property="og:image:width" content={String(image.width)} />
		<meta property="og:image:height" content={String(image.height)} />
		<meta property="og:image:alt" content={image.alt} />
		<meta name="twitter:card" content="summary_large_image" />
	{/if}
</svelte:head>
