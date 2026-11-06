// Own config so prettier runs inside this package, where prettier-plugin-svelte is installed.
// (Under the root config, prettier would load this package's prettier.config.js but resolve
// the plugin from the repo root and fail.)
export default {
	"*.{js,ts,svelte,json,md}": "prettier --write",
};
