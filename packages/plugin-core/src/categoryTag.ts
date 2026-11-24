// Markers carry their category as a "#Name" first line, followed by a blank line and the description.
// A first line like "#2 check again" can also be the description itself, so "#Name" only counts as
// the tag when a blank line follows (the way withCategoryTag writes it), or when it names one of the
// project's categories (compared without case).
export function parseCategoryTag(description: string, knownNames: Iterable<string>) {
	const [firstLine, ...rest] = description.split("\n");
	const name = firstLine!.substring(1).trim();
	if (!firstLine!.startsWith("#") || !name) return { categoryName: null, description };
	const blankLineAfter = rest.length > 0 && rest[0]!.trim() === "";
	if (!blankLineAfter && !isKnown(name, knownNames)) return { categoryName: null, description };
	return {
		categoryName: name,
		description: rest.join("\n").trimStart(),
	};
}

function isKnown(name: string, knownNames: Iterable<string>) {
	const lower = name.toLowerCase();
	for (const known of knownNames) if (known.toLowerCase() === lower) return true;
	return false;
}

export function withCategoryTag(categoryName: string, description: string | null) {
	return description ? `#${categoryName}\n\n${description}` : `#${categoryName}`;
}
