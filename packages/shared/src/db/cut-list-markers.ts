// Saving the markers of a cut list (see logic/cut-list.ts) as PostPin markers: by the worker after
// an upload, and by the review page when markers are imported later.
import type { CutList } from "../logic/cut-list.ts";
import type { PlacedMarker } from "../logic/web-upload.ts";
import type { PrismaClient } from "./prisma/client.ts";

/** FNV-1a, 32 bit: short and stable, nothing secret depends on it */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The marker's nleId: the format it came from (so the review can say "Markers from the EDL", see
 * importedMarkerCounts) and a hash of what it is, so the same marker imported again (a retried
 * job, the same list uploaded twice) isn't added twice, while other markers never collide with it
 */
export const cutListMarkerId = (m: PlacedMarker, format: CutList["format"]) =>
	`cutList:${format}:${hash([m.frame, m.duration, m.category.name, m.name, m.description ?? ""].join("\u0000"))}`;

/** How many of the export's markers came from each format of timeline data */
export async function importedMarkerCounts(
	db: Pick<PrismaClient, "marker">,
	exportId: string,
): Promise<Record<CutList["format"], number>> {
	const count = (format: CutList["format"]) =>
		db.marker.count({ where: { exportId, nleId: { startsWith: `cutList:${format}:` } } });
	const [edl, fcpxml] = await Promise.all([count("edl"), count("fcpxml")]);
	return { edl, fcpxml };
}

/**
 * Adds the markers to the export, in a category per color shared with the project's other markers
 * of that name (created if needed). Markers that are there already are skipped. Resolves with how
 * many were added.
 */
export async function saveCutListMarkers(
	db: Pick<PrismaClient, "category" | "marker">,
	a: {
		exportId: string;
		projectId: string;
		authorId: string | null;
		format: CutList["format"];
		markers: PlacedMarker[];
	},
): Promise<number> {
	if (a.markers.length === 0) return 0;
	const categoryIds = new Map<string, string>();
	for (const { name, color } of new Map(
		a.markers.map((m) => [m.category.name, m.category]),
	).values()) {
		const category = await db.category.upsert({
			where: { projectId_name: { projectId: a.projectId, name } },
			create: { projectId: a.projectId, name, color, createdById: a.authorId },
			update: {},
			select: { id: true },
		});
		categoryIds.set(name, category.id);
	}
	const { count } = await db.marker.createMany({
		data: a.markers.map((m) => ({
			exportId: a.exportId,
			nleId: cutListMarkerId(m, a.format),
			name: m.name,
			description: m.description,
			frame: m.frame,
			duration: m.duration,
			categoryId: categoryIds.get(m.category.name)!,
			authorId: a.authorId,
		})),
		skipDuplicates: true,
	});
	return count;
}
