import * as env from "$app/env/private";
import { version } from "$app/env";
import { Controller, Get, Route, Security } from "@tsoa/runtime";
import { PROXY_AUDIO, PROXY_RENDITIONS } from "@postpin-io/shared/media/hls";
import { POSTPIN_API_VERSION } from "@postpin-io/shared/api-version";

interface ProxyRendition {
	/** the box the video is fitted into, keeping its aspect ratio */
	width: number;
	height: number;
	/** video bits per second */
	bitRate: number;
}

interface ClientConfig {
	/** Plugins must speak exactly this API version, the API rejects others with 426 */
	apiVersion: number;
	/** Release the server runs, e.g. `1.4.2`; its plugins speak its API version */
	serverRelease: string;
	transcode: {
		/**
		 * `plugin`: plugins encode the review proxies with hlsArgs() and upload them with the original.
		 * The server still encodes when a plugin can't. `server`: the server always encodes.
		 */
		mode: "plugin" | "server";
		/** Largest first. Encode only those selectRenditions() picks for the render's size. */
		renditions: ProxyRendition[];
		audio: { codec: string; bitRate: number };
	};
}

@Route("v1/config")
@Security("session")
export class ConfigController extends Controller {
	/** What a plugin needs to know before rendering and uploading */
	@Get("")
	public async getConfig(): Promise<ClientConfig> {
		return {
			apiVersion: POSTPIN_API_VERSION,
			serverRelease: version,
			transcode: {
				mode: env.TRANSCODE_MODE,
				renditions: PROXY_RENDITIONS.map((rendition) => ({ ...rendition })),
				audio: { ...PROXY_AUDIO },
			},
		};
	}
}
