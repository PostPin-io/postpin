<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import logo from "#lib/images/svelte-logo.svg";
</script>

<!-- 
<header>
	<div class="corner">
		<a href="https://svelte.dev/docs/kit">
			<img src={logo} alt="SvelteKit" />
		</a>
	</div>

	<nav>
		<ul>
			<li aria-current={page.url.pathname === "/" ? "page" : undefined}>
				<a href={resolve("/")}>Home</a>
			</li>
			<li aria-current={page.url.pathname === "/about" ? "page" : undefined}>
				<a href={resolve("/about")}>About</a>
			</li>
			<li aria-current={page.url.pathname === "/dbtests" ? "page" : undefined}>
				<a href={resolve("/dbtests")}>dbtests</a>
			</li>
		</ul>
	</nav>
</header>

<style>
</style> -->

<header class="w-full rounded-md bg-base-200 shadow-sm max-lg:collapse">
	<input id="navbar-1-toggle" class="peer hidden" type="checkbox" />
	<label for="navbar-1-toggle" class="fixed inset-0 hidden max-lg:peer-checked:block"></label>
	<nav class="collapse-title navbar">
		<div class="navbar-start">
			<label for="navbar-1-toggle" class="btn btn-ghost lg:hidden">
				<svg
					aria-label="Menu"
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h8m-8 6h16"
					/></svg
				>
			</label>
			<button class="btn btn-ghost text-xl">PostPin</button>
		</div>
		<div class="navbar-center hidden lg:flex">
			<ul class="menu menu-horizontal px-1">
				<li>
					<a href={resolve("/")}>Home</a>
				</li>
				<li>
					<a href={resolve("/about")}>About</a>
				</li>
				<li>
					<a href={resolve("/dbtests")}>dbtests</a>
				</li>
			</ul>
		</div>
		<div class="navbar-end">
			<input type="text" placeholder="Search" class="input w-64 lg:w-auto" />
		</div>
	</nav>

	<div class="collapse-content z-1 lg:hidden">
		<ul class="menu">
			<li><button>Item 1</button></li>
			<li>
				<button>Parent</button>
				<ul>
					<li><button>Submenu 1</button></li>
					<li><button>Submenu 2</button></li>
				</ul>
			</li>
			<li><button>Item 3</button></li>
		</ul>
	</div>
</header>
