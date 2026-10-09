// Root-level files only. Each package has its own lint-staged.config.js,
// which lint-staged picks for files inside that package.
export default {
	"*.{js,mjs,cjs,ts,json,md,yml,yaml}": "prettier --write",
};
