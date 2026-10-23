export function seekToMarker(
	direction: -1 | 1,
	{
		markers,
		playHeadPosition,
	}: {
		markers: { frame: number }[];
		playHeadPosition: number;
	},
) {
	// Don't rely on the markers being sorted
	const sorted = [...markers].sort((a, b) => a.frame - b.frame);
	const marker =
		direction < 0
			? sorted.findLast((marker) => marker.frame < playHeadPosition)
			: sorted.find((marker) => marker.frame > playHeadPosition);
	if (marker !== undefined) return marker.frame;
}
