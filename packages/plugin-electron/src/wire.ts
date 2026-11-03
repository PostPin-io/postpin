// eipc is missing unions, so we cant send the pallette type over the wire

import type { Capabilities, NleMarker } from "@postpin-io/plugin-core/bridge";
import type {
	Capabilities as WireCapabilities,
	NleMarker as WireMarker,
} from "./ipc/common/PostPin";

export function toWireCapabilities({ palette, ...capabilities }: Capabilities): WireCapabilities {
	return {
		...capabilities,
		palette: palette === "rgb" ? [] : palette,
		anyColor: palette === "rgb",
	};
}

export function fromWireCapabilities({
	palette,
	anyColor,
	...capabilities
}: WireCapabilities): Capabilities {
	return { ...capabilities, palette: anyColor ? "rgb" : palette };
}

// eipc has optional fields instead of null
export function toWireMarker({ nleId, customData, ...marker }: NleMarker): WireMarker {
	return {
		...marker,
		...(nleId === null ? {} : { nleId }),
		...(customData === null ? {} : { customData }),
	};
}

export function fromWireMarker(marker: WireMarker): NleMarker {
	return { ...marker, nleId: marker.nleId ?? null, customData: marker.customData ?? null };
}
