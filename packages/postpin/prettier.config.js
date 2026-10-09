import base from "../../prettier.config.js";

/** @type {import("prettier").Config} */
const config = {
	...base,
	plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
	overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
	tailwindStylesheet: "./src/routes/layout.css",
};

export default config;
