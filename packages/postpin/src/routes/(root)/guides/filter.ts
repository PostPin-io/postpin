/** The text filter of the PostPin Guides page: every word must appear in title or description */
export function matchesGuide(guide: { title: string; description: string }, query: string) {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const text = `${guide.title} ${guide.description}`.toLowerCase();
	return words.every((word) => text.includes(word));
}
