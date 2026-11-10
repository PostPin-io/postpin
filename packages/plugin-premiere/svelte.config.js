/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
	// plugin-core's UI uses await in components, same as plugin-resolve
	compilerOptions: { experimental: { async: true } },
};
