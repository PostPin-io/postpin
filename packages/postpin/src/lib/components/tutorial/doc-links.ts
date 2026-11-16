// Every link from the tutorial into the docs, so a moved page is fixed in one place
const DOCS = "https://docs.postpin.io";

export const DOC_LINKS = {
	downloads: `${DOCS}/downloads`,
	markerSync: `${DOCS}/plugins#syncing-markers`,
} as const;

/** The server the plugins log in to unless told otherwise (DEFAULT_SERVER_URL of their builds) */
export const HOSTED_ORIGIN = "https://postpin.io";

/** The detailed guide of each plugin: installing, opening, logging in */
export const PLUGIN_GUIDES = [
	{ label: "DaVinci Resolve", href: `${DOCS}/plugins/resolve` },
	{ label: "Premiere Pro", href: `${DOCS}/plugins/premiere` },
	{ label: "Pro Tools", href: `${DOCS}/plugins/desktop` },
] as const;
