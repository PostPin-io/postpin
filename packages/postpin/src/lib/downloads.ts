/**
 * Where the plugins are downloaded. Plugins and server are released together with one version,
 * so the installers of the server's own release are the ones that speak its API.
 */

export const DOWNLOADS_URL = "https://docs.postpin.io/downloads";
const RELEASES_URL = "https://github.com/PostPin-io/postpin/releases/download";

/** The server the plugins sign in to unless told otherwise ("Use hosted PostPin server") */
export const HOSTED_SERVER_URL = "https://postpin.io";

/** This server is the hosted one, or in dev the dev server (dev builds of the plugins use it) */
export const isHostedServer = (origin: string, dev = false) =>
	origin === (dev ? "http://localhost:5173" : HOSTED_SERVER_URL);

export type DesktopOs = "mac" | "windows";

export const OS_LABEL: Record<DesktopOs, string> = { mac: "macOS", windows: "Windows" };

export type Plugin = "resolve" | "premiere" | "desktop";

/** Release asset names, as packages/*\/scripts and electron-builder.yml build them */
const ASSET: Record<Plugin, (version: string, os: DesktopOs) => string> = {
	resolve: (v, os) => `PostPin-Resolve-${v}.${os === "mac" ? "pkg" : "exe"}`,
	// one .ccx for both
	premiere: (v) => `PostPin-Premiere-${v}.ccx`,
	desktop: (v, os) =>
		os === "mac" ? `PostPin-Desktop-${v}-universal.dmg` : `PostPin-Desktop-${v}-x64.exe`,
};

/** "0.5.2+abc123-dirty" → "0.5.2"; null for builds without a release behind them ("ci-<sha>") */
export function releaseVersion(appVersion: string): string | null {
	return /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+|$)/.exec(appVersion)?.[1] ?? null;
}

/** The installer of this release, or the downloads page when there is no release */
export function pluginInstaller(plugin: Plugin, os: DesktopOs, appVersion: string) {
	const version = releaseVersion(appVersion);
	if (!version) return { url: DOWNLOADS_URL, file: null };
	const file = ASSET[plugin](version, os);
	return { url: `${RELEASES_URL}/v${version}/${file}`, file };
}

/**
 * The OS of this browser, as a default only: people often read on one machine and install on
 * another. Anything that isn't Windows counts as macOS (Linux has no installer yet).
 */
export function detectOs(
	platform = typeof navigator === "undefined"
		? ""
		: ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
			navigator.userAgent),
): DesktopOs {
	return /win/i.test(platform) ? "windows" : "mac";
}
