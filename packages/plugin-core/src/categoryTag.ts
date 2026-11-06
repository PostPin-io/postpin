// Markers carry their category as a "#Name" first line, followed by a blank line and the description
export function parseCategoryTag(description: string) {
	const [firstLine, ...rest] = description.split("\n");
	const name = firstLine!.substring(1).trim();
	if (!firstLine!.startsWith("#") || firstLine!.length < 2 || !name) {
		return { categoryName: null, description };
	}
	return {
		categoryName: name,
		description: rest.join("\n").trimStart(),
	};
}

export function withCategoryTag(categoryName: string, description: string | null) {
	return description ? `#${categoryName}\n\n${description}` : `#${categoryName}`;
}
