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

export function toWireMarker({ customData, ...marker }: NleMarker): WireMarker {
	return customData === null ? marker : { ...marker, customData };
}

export function fromWireMarker(marker: WireMarker): NleMarker {
	return { ...marker, customData: marker.customData ?? null };
}
