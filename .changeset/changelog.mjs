/**
 * Changelog lines for What's New: the changeset's text as written, without the commit hash the
 * default generator puts in front, and without "Updated dependencies" lines (all packages share
 * one version, so those say nothing).
 */
export default {
	getReleaseLine: async (changeset) => {
		const [first, ...rest] = changeset.summary.split("\n").map((line) => line.trimEnd());
		return [`- ${first}`, ...rest.map((line) => (line ? `  ${line}` : line))].join("\n");
	},
	getDependencyReleaseLine: async () => "",
};
