/** Shared base config. Packages extend this and add their own plugins. */
/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: false,
	trailingComma: "all",
	printWidth: 100,
};

export default config;
