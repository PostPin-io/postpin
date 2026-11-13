<script lang="ts">
	import { DPA_URL, IMPRINT_URL, PRIVACY_URL, TERMS_URL } from "$app/env/public";

	interface Props {
		class?: string;
	}
	let { class: className = "" }: Props = $props();

	// Each link only shows when the operator configured it. Self-hosted instances default to none.
	const links = [
		{ href: IMPRINT_URL, label: "Imprint" },
		{ href: PRIVACY_URL, label: "Privacy" },
		{ href: TERMS_URL, label: "Terms" },
		{ href: DPA_URL, label: "DPA" },
	].filter((link): link is { href: string; label: string } => !!link.href);
</script>

{#if links.length}
	<nav aria-label="Legal" class="flex flex-wrap justify-center gap-x-4 gap-y-1 {className}">
		{#each links as link (link.label)}
			<a class="link link-hover" href={link.href} target="_blank" rel="noopener">{link.label}</a>
		{/each}
	</nav>
{/if}
