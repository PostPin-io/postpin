// clients allowed to use the device authorization flow, with the name shown on /auth/device
export const DEVICE_CLIENTS: Record<string, string> = {
	"io.postpin.plugin.resolve": "PostPin for DaVinci Resolve",
	// Client ID of the Resolve plugin before 0.2.0, kept so existing sessions still show the right name
	"io.postpin.plugin-resolve": "PostPin for DaVinci Resolve",
	"io.postpin.desktop": "PostPin Desktop",
};
