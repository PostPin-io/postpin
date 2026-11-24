/**
 * The programs PostPin has a plugin for, as the web app talks about them. Keyed by the plugin's
 * `hostName` (what it stores in a marker set), with its device-flow client (DEVICE_CLIENTS).
 * The display names match the plugins' own (plugin-core/src/ui/hosts.ts).
 */
export interface PluginProgram {
	hostName: string;
	/** As shown on screen: "DaVinci Resolve" */
	name: string;
	clientId: string;
	/** What the plugin is called there: in Pro Tools it is PostPin Desktop */
	plugin: string;
	/** A marker in that program: memory locations in Pro Tools */
	marker: { one: string; many: string };
	/** The plugin can also render to disk (capabilities.renderToDisk) */
	renderToDisk: boolean;
}

export const PLUGIN_PROGRAMS: readonly PluginProgram[] = [
	{
		hostName: "Resolve",
		name: "DaVinci Resolve",
		clientId: "io.postpin.plugin.resolve",
		plugin: "the PostPin plugin",
		marker: { one: "marker", many: "markers" },
		renderToDisk: true,
	},
	{
		hostName: "Premiere Pro",
		name: "Premiere Pro",
		clientId: "io.postpin.plugin.premiere",
		plugin: "the PostPin plugin",
		marker: { one: "marker", many: "markers" },
		renderToDisk: false,
	},
	{
		hostName: "Pro Tools",
		name: "Pro Tools",
		clientId: "io.postpin.desktop",
		plugin: "PostPin Desktop",
		marker: { one: "memory location", many: "memory locations" },
		renderToDisk: false,
	},
];

export const programByHost = (hostName: string | null | undefined) =>
	PLUGIN_PROGRAMS.find((p) => p.hostName === hostName) ?? null;

export const programByClient = (clientId: string | null | undefined) =>
	PLUGIN_PROGRAMS.find((p) => p.clientId === clientId) ?? null;
