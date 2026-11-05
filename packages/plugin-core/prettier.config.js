import base from "../../prettier.config.js";

/** @type {import("prettier").Config} */
const config = {
	...base,
	plugins: ["prettier-plugin-svelte"],
	overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
};

export default config;
