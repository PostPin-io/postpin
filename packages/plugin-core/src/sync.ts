import {
	getMarkers,
	uploadMarkers,
	getCategories,
	createCategory,
	type UploadMarker,
} from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";

import type { ColorPalette, NleBridge, NleMarker } from "./bridge";
import { parseCategoryTag, withCategoryTag } from "./categoryTag";
import { closestColor, colorToHex, DEFAULT_MARKER_HEX } from "./colors";
import { parsePostPinData, stringifyPostPinData } from "./customData";

export interface SyncContext {
	nle: NleBridge;
	client: Client;
	projectId: string;
	timelineId: string;
	exportId: string;
}

// Uploads the NLE's markers to the export. The server updates markers it already has, by their NLE id
// or, for markers pulled from PostPin, by their PostPin id. Markers without a "#Category" tag land in
// a category named after their color.
export async function syncMarkersUp({ nle, client, projectId, timelineId, exportId }: SyncContext) {
	const [markers, { hostName, palette }] = await Promise.all([
		nle.getMarkers(),
		nle.getCapabilities(),
	]);

	const { data: categories } = await getCategories({
		client,
		path: { projectId },
		throwOnError: true,
	});

	const mappedMarkers: UploadMarker[] = [];
	for (const m of markers) {
		const parsed = parseCategoryTag(m.description);
		const categoryName = parsed.categoryName ?? colorCategoryName(hostName, m.color, palette);
		let category = categories.find((c) => c.name === categoryName);
		if (!category) {
			({ data: category } = await createCategory({
				client,
				body: { name: categoryName, color: colorToHex(m.color, palette) },
				path: { projectId },
				throwOnError: true,
			}));
			categories.push(category);
		}
		mappedMarkers.push({
			name: m.title,
			description: parsed.description,
			frame: m.frame,
			categoryId: category.id,
			nleId: m.nleId,
			id: postpinIdOf(m),
		});
	}

	await uploadMarkers({
		client,
		body: mappedMarkers,
		path: { projectId, timelineId, exportId },
		throwOnError: true,
	});
}

// Writes the export's markers into the NLE, with their category as "#Category" tag and nearest color.
// Categories named after the color (e.g. "Resolve Blue") need no tag, the color says it already.
export async function syncMarkersDown({
	nle,
	client,
	projectId,
	timelineId,
	exportId,
}: SyncContext) {
	const [{ data: markers }, { data: categories }, { hostName, palette }] = await Promise.all([
		getMarkers({ client, path: { projectId, timelineId, exportId }, throwOnError: true }),
		getCategories({ client, path: { projectId }, throwOnError: true }),
		nle.getCapabilities(),
	]);
	const categoriesById = new Map(categories.map((c) => [c.id, c]));

	const mappedMarkers = markers.map((m): NleMarker => {
		const category = categoriesById.get(m.categoryId);
		const color = closestColor(category?.color ?? DEFAULT_MARKER_HEX, palette);
		const needsTag = category && category.name !== colorCategoryName(hostName, color, palette);
		return {
			// updates the NLE marker this one was pushed from or pulled into before
			nleId: m.nleId,
			title: m.name,
			description: needsTag ? withCategoryTag(category.name, m.description) : (m.description ?? ""),
			frame: m.frame,
			color,
			customData: stringifyPostPinData({ id: m.id }),
		};
	});
	const nleIds = await nle.setMarkers(mappedMarkers);

	// Tell PostPin which NLE marker each new marker became, so the next push updates them instead of
	// adding them again. Matters most for hosts without custom data, like Pro Tools.
	const linked = markers
		.map((m, i) => ({ m, nleId: nleIds[i] }))
		.filter(({ m, nleId }) => nleId && nleId !== m.nleId);
	if (linked.length === 0) return;
	await uploadMarkers({
		client,
		body: linked.map(({ m, nleId }) => ({
			id: m.id,
			nleId,
			name: m.name,
			description: m.description,
			frame: m.frame,
			categoryId: m.categoryId,
		})),
		path: { projectId, timelineId, exportId },
		throwOnError: true,
	});
}

// The PostPin id a marker pulled from PostPin keeps in its custom data
function postpinIdOf(marker: NleMarker) {
	return parsePostPinData(marker.customData)?.id;
}

// The category a marker without "#Category" tag lands in: the host and color, e.g. "Resolve Blue"
function colorCategoryName(hostName: string, color: string, palette: ColorPalette) {
	const colorName =
		palette === "rgb" ? color : (palette.find((c) => c.id === color)?.name ?? color);
	return `${hostName} ${colorName}`;
}
