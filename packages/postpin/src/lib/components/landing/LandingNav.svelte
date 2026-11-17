<script lang="ts">
	import Logo from "#lib/components/layout/Logo.svelte";
	import Menu from "@lucide/svelte/icons/menu";
	import { page } from "$app/state";

	interface Props {
		/**
		 * Floats over the page instead of taking up space, so the slides' backgrounds run under it
		 * (the landing page). /classic keeps it in the flow.
		 */
		floating?: boolean;
		/**
		 * Only the sign-in buttons, on a transparent bar: for the first slide, which shows the logo
		 * and the name big itself. Brand, links and background fade in once it is left.
		 */
		minimal?: boolean;
		/**
		 * A bar over the full width with a line under it, instead of the rounded bar inset from the
		 * edges (/landing/4). Its content still lines up with the page.
		 */
		wide?: boolean;
		/** Only the brand is out of sight: the page shows the logo big itself, as long as it is in view */
		brandHidden?: boolean;
	}
	let { floating = false, minimal = false, wide = false, brandHidden = false }: Props = $props();

	// /?about shows the landing page to signed-in users too; they go back to the app instead
	const signedIn = $derived(!!page.data.signedIn);

	const sections = [
		{ href: "#how-it-works", label: "How it works" },
		{ href: "#features", label: "Features" },
		{ href: "#editors", label: "Editors" },
		{ href: "#hosting", label: "Hosting" },
		{ href: "https://docs.postpin.io", label: "Docs" },
	];

	// Faded out, and out of the tab order and away from clicks while it is
	const hidden = $derived(minimal ? "pointer-events-none opacity-0" : "opacity-100");
	const brandOff = $derived(minimal || brandHidden);
	const brandClass = $derived(brandOff ? "pointer-events-none opacity-0" : "opacity-100");
	const headerClass = $derived(
		wide
			? // solid: a blur over the full width is repainted on every scrolled frame, which stutters in Safari
				"border-b border-base-300 bg-base-200 px-4"
			: `px-2 py-2 ${minimal ? "bg-transparent" : "bg-base-100/90 backdrop-blur-md"}`,
	);
	const navClass = $derived(
		wide
			? "px-0"
			: `rounded-md transition-[background-color,box-shadow] duration-300 ${
					minimal ? "bg-transparent shadow-none" : "bg-base-200/90 shadow-sm"
				}`,
	);
</script>

<!--
	Same look as the app header: a base-200 navbar with daisyUI buttons and menus. The bar around
	it is blurred too, so the page never shows through the gap above and below the navbar.
-->
<header
	class="{floating
		? 'fixed inset-x-0'
		: 'sticky'} top-0 z-50 transition-[background-color,backdrop-filter] duration-300 {headerClass}"
>
	<nav class="navbar mx-auto max-w-6xl {navClass}">
		<div class="navbar-start">
			<div class="dropdown md:hidden {hidden} transition-opacity duration-300">
				<div
					tabindex={minimal ? -1 : 0}
					role="button"
					class="btn btn-square btn-ghost"
					aria-label="Menu"
				>
					<Menu class="size-5" />
				</div>
				<ul
					tabindex="-1"
					class="menu dropdown-content z-10 mt-2 w-52 rounded-box bg-base-100 p-2 shadow"
				>
					{#each sections as section (section.href)}
						<li><a href={section.href}>{section.label}</a></li>
					{/each}
				</ul>
			</div>
			<a
				href="/"
				class="btn btn-ghost text-xl transition-opacity duration-300 {brandClass}"
				tabindex={brandOff ? -1 : undefined}
				aria-hidden={brandOff}
			>
				<Logo class="h-6 w-auto" />
				PostPin
			</a>
		</div>
		<div class="navbar-center hidden transition-opacity duration-300 md:flex {hidden}">
			<ul class="menu menu-horizontal px-1">
				{#each sections as section (section.href)}
					<li><a href={section.href} tabindex={minimal ? -1 : undefined}>{section.label}</a></li>
				{/each}
			</ul>
		</div>
		<div class="navbar-end gap-1">
			{#if signedIn}
				<a class="btn btn-primary" href="/dashboard">Open app</a>
			{:else}
				<a class="btn btn-ghost" href="/auth/login">Log in</a>
				<a class="btn btn-primary max-sm:hidden" href="/auth/signup">Create account</a>
			{/if}
		</div>
	</nav>
</header>
