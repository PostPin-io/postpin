/**
 * Version of the contract between the server and the NLE plugins: the API and the proxy encoding
 * (hlsArgs). Plugins send it in API_VERSION_HEADER and the API rejects any other with 426. Increment
 * it with every change a plugin built for the previous one can't handle. Server and plugin
 * releases keep their own semver versions.
 */
export const POSTPIN_API_VERSION = 1;

export const API_VERSION_HEADER = "X-PostPin-Api-Version";

/** Every release ships the server and all plugins under one tag */
export const RELEASES_URL = "https://github.com/PostPin-io/postpin/releases";

/** Release asset `{ "apiVersion": n }`, so updaters know a release's API version before installing */
export const API_VERSION_ASSET = "api-version.json";

const RELEASE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Download page of the plugins that belong to a server's release, null for builds that aren't a
 * release (e.g. `0.0.1+abc123` from a dev build)
 */
export function releaseDownloadUrl(release: string | null | undefined) {
	return release && RELEASE.test(release) ? `${RELEASES_URL}/tag/v${release}` : null;
}

/** URL of the API version asset of a release, e.g. the one an updater found */
export function releaseApiVersionUrl(release: string) {
	return `${RELEASES_URL}/download/v${release}/${API_VERSION_ASSET}`;
}
