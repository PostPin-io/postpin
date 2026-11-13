/**
 * The shot thumbnail URLs after asking again while the render runs: shots that just got their
 * image get the new URL, shots already shown keep theirs. A presigned URL changes with every
 * request, and a new one would make the browser load the same image again.
 */
export function mergeShotUrls(
	previous: (string | null)[] | undefined,
	next: (string | null)[],
): (string | null)[] {
	return next.map((url, i) => (url === null ? null : (previous?.[i] ?? url)));
}
