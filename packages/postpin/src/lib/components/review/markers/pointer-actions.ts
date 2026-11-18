import type { PointerColor, PointerGeometry } from "@postpin-io/shared/logic/pointers";
import { createPointer, deletePointer, getMarkers, updatePointer } from "./markers.remote.ts";
import { markersKey } from "./marker-scope.ts";
import type { ReviewPointer } from "./types.ts";

/** Where the marker lives: the export, and the share token for guests */
export interface PointerScope {
	exportId: string;
	shareToken?: string;
}

export function geometryOf(pointer: ReviewPointer): PointerGeometry {
	return pointer.kind === "RECT"
		? {
				kind: "RECT",
				x: pointer.x,
				y: pointer.y,
				width: pointer.width ?? 0,
				height: pointer.height ?? 0,
			}
		: { kind: "ARROW", x: pointer.x, y: pointer.y };
}

// Shows a change everywhere right away (picture, list), before the server answers
function override(
	scope: PointerScope,
	markerId: string,
	change: (pointers: ReviewPointer[]) => ReviewPointer[],
) {
	return getMarkers(markersKey(scope.exportId, scope.shareToken)).withOverride((markers) =>
		markers.map((m) => (m.id === markerId ? { ...m, pointers: change(m.pointers) } : m)),
	);
}

export function addPointer(scope: PointerScope, markerId: string, geometry: PointerGeometry) {
	return createPointer({ markerId, geometry, shareToken: scope.shareToken });
}

export function changePointer(
	scope: PointerScope,
	markerId: string,
	id: string,
	change: { geometry?: PointerGeometry; color?: PointerColor },
) {
	const { geometry, color } = change;
	return updatePointer({ id, geometry, color, shareToken: scope.shareToken }).updates(
		override(scope, markerId, (pointers) =>
			pointers.map((p) =>
				p.id !== id
					? p
					: {
							...p,
							...(geometry
								? {
										x: geometry.x,
										y: geometry.y,
										width: geometry.kind === "RECT" ? geometry.width : null,
										height: geometry.kind === "RECT" ? geometry.height : null,
									}
								: {}),
							...(color ? { color } : {}),
						},
			),
		),
	);
}

export function removePointer(scope: PointerScope, markerId: string, id: string) {
	return deletePointer({ id, shareToken: scope.shareToken }).updates(
		override(scope, markerId, (pointers) => pointers.filter((p) => p.id !== id)),
	);
}
