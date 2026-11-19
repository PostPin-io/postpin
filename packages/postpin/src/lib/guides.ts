/**
 * PostPin Guides: tutorials teach the essential mechanics step by step (full screen), tours explain a
 * single feature (popovers, everything else dimmed). What each guide does is specified in
 * docs/guides/; the ids here are the file names there and the keys of the stored progress.
 */

export type GuideType = "tutorial" | "tour";

export interface Guide {
	id: string;
	type: GuideType;
	/**
	 * automatic: starts on its own once its prerequisites are met (tutorials, and the tour that
	 * explains the guide system). manual: started with its guide button at the feature.
	 */
	trigger: "automatic" | "manual";
	title: string;
	/** One sentence for the PostPin Guides page */
	description: string;
	/** Shown on the PostPin Guides page after "Start" when there's nothing to start it on */
	restartHint: string;
	/**
	 * How the PostPin Guides page starts it, always where its first step is: on a fixed page
	 * (`href`), right there (`here`: its first step is in the header or on the guides page), or on
	 * a page the server picks (`found`: `getGuideStart`, e.g. an export the user may share)
	 */
	startFrom: { href: "/(root)/dashboard" } | "here" | "found";
}

export const GUIDES = [
	{
		id: "first-upload",
		type: "tutorial",
		trigger: "automatic",
		title: "Your first upload",
		description:
			"Create your organization, a project and a timeline, and upload your first export.",
		restartHint: "Starts on the dashboard.",
		startFrom: { href: "/(root)/dashboard" },
	},
	{
		id: "install-resolve",
		type: "tutorial",
		trigger: "automatic",
		title: "Installing the Resolve plugin",
		description:
			"Install the PostPin plugin in DaVinci Resolve Studio on macOS or Windows and sign it in.",
		restartHint: "Starts right here.",
		startFrom: "here",
	},
	{
		id: "install-premiere",
		type: "tutorial",
		trigger: "automatic",
		title: "Installing the Premiere Pro plugin",
		description: "Install the PostPin panel in Premiere Pro on macOS or Windows and sign it in.",
		restartHint: "Starts right here.",
		startFrom: "here",
	},
	{
		id: "install-desktop",
		type: "tutorial",
		trigger: "automatic",
		title: "Installing PostPin Desktop",
		description:
			"Install PostPin Desktop for Pro Tools on macOS or Windows, connect it and sign it in.",
		restartHint: "Starts right here.",
		startFrom: "here",
	},
	{
		id: "postpin-guides",
		type: "tour",
		trigger: "automatic",
		title: "PostPin Guides",
		description: "How guides work: the guide buttons, this page, and switching guides off.",
		restartHint: "Starts right here.",
		startFrom: "here",
	},
	{
		id: "navigation",
		type: "tour",
		trigger: "manual",
		title: "Finding your way",
		description:
			"From the dashboard through projects and timelines to an export, and back with the breadcrumbs.",
		restartHint: "Starts at the dashboard button in the header.",
		startFrom: "here",
	},
	{
		id: "share-link",
		type: "tour",
		trigger: "manual",
		title: "Share links",
		description: "Share an export with people who don't have an account.",
		restartHint:
			"Needs an export you may share: its guide button is back next to the share button.",
		startFrom: "found",
	},
] as const satisfies readonly Guide[];

export type GuideId = (typeof GUIDES)[number]["id"];
export const GUIDE_IDS = GUIDES.map((g) => g.id) as [GuideId, ...GuideId[]];

/**
 * One look per type, so the color tells a tutorial from a tour (not one guide from another).
 * Full class names: Tailwind only finds classes written out in the source.
 */
export const GUIDE_STYLE = {
	tutorial: {
		label: "Tutorial",
		badge: "badge-primary",
		button: "btn-primary",
		text: "text-primary",
		ring: "ring-primary",
		border: "border-l-primary",
		dot: "bg-primary",
		tile: "bg-primary/15",
	},
	tour: {
		label: "Tour",
		badge: "badge-accent",
		button: "btn-accent",
		text: "text-accent",
		ring: "ring-accent",
		border: "border-l-accent",
		dot: "bg-accent",
		tile: "bg-accent/15",
	},
} as const satisfies Record<GuideType, Record<string, string>>;

/** The attribute a guide step points at: `data-guide="<guide-id>/<step-id>"` */
export const guideAnchor = (guideId: GuideId, stepId: string) => `${guideId}/${stepId}`;
