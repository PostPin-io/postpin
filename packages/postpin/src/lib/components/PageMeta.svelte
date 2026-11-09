<script lang="ts">
	const DEFAULT_DESCRIPTION =
		"Your intuitive, easy and selfhosted video review and marker management tool";

	let { title, description = DEFAULT_DESCRIPTION }: { title?: string; description?: string } =
		$props();

	const fullTitle = $derived(title ? `${title} | PostPin` : "PostPin");
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
</svelte:head>
