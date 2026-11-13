import type { AvailableUpdate, Updater } from "./bridge";

/**
 * Downloads the newest release in the background, but only when it speaks the server's API
 * version: a server pinned to an older release keeps the plugin that matches it, instead of the
 * newest one that it would reject. Returns the downloaded update, which installs when the app quits
 * (or right away with updater.install()); null when there is none that fits.
 */
export async function prepareCompatibleUpdate(
	updater: Updater,
	serverApiVersion: number,
): Promise<AvailableUpdate | null> {
	const update = await updater.check();
	// null: the release's api-version.json couldn't be read, so it might not fit
	if (!update || update.apiVersion !== serverApiVersion) return null;
	await updater.download(() => {});
	return update;
}
