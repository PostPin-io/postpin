export default {
	// Type-check runs on the whole project (not just staged files) once per commit.
	"*.{js,ts,svelte}": ["prettier --write", "eslint --fix", () => "pnpm run check"],
	"*.{css,json,md,html,yml,yaml}": "prettier --write",
};
