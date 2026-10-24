// Only used by svelte-check. Apps compile these components with their own svelte config,
// which needs the same async flag.
/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
	compilerOptions: {
		experimental: { async: true },
	},
};
