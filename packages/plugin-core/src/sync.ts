import {
	getMarkers,
	uploadMarkers,
	getCategories,
	createCategory,
} from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";

import type { NleBridge, NleMarker } from "./bridge";
import { parseCategoryTag, withCategoryTag } from "./categoryTag";
import { closestColor, colorToHex, DEFAULT_MARKER_HEX } from "./colors";

// Stored in the NLE marker's custom data, to recognize markers that came from PostPin
interface CustomData {
	__postpin?: boolean;
	id?: string;
}

export interface SyncContext {
	nle: NleBridge;
	client: Client;
	projectId: string;
	timelineId: string;
	exportId: string;
}

// Uploads the NLE's markers to the export. Markers that came from PostPin keep their id,
// markers without a "#Category" tag land in a category named after their color.
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

	const mappedMarkers = [];
	for (const m of markers) {
		let customData: CustomData = {};
		try {
			customData = JSON.parse(m.customData || "{}");
		} catch (e) {
			console.error("Error parsing custom data:", e);
		}
		const parsed = parseCategoryTag(m.description);
		const colorName =
			palette === "rgb" ? m.color : (palette.find((c) => c.id === m.color)?.name ?? m.color);
		const categoryName = parsed.categoryName ?? `${hostName} ${colorName}`;
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
			id: customData.__postpin ? customData.id : undefined,
		});
	}

	await uploadMarkers({
		client,
		body: mappedMarkers,
		path: { projectId, timelineId, exportId },
		throwOnError: true,
	});
}

// Writes the export's markers into the NLE, with their category as "#Category" tag and nearest color
export async function syncMarkersDown({
	nle,
	client,
	projectId,
	timelineId,
	exportId,
}: SyncContext) {
	const [{ data: markers }, { data: categories }, { palette }] = await Promise.all([
		getMarkers({ client, path: { projectId, timelineId, exportId }, throwOnError: true }),
		getCategories({ client, path: { projectId }, throwOnError: true }),
		nle.getCapabilities(),
	]);
	const categoriesById = new Map(categories.map((c) => [c.id, c]));

	const mappedMarkers = markers.map((m): NleMarker => {
		const category = categoriesById.get(m.categoryId);
		return {
			title: m.name,
			description: category ? withCategoryTag(category.name, m.description) : (m.description ?? ""),
			frame: m.frame,
			color: closestColor(category?.color ?? DEFAULT_MARKER_HEX, palette),
			customData: JSON.stringify({ __postpin: true, id: m.id } satisfies CustomData),
		};
	});
	await nle.setMarkers(mappedMarkers);
}
