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
	/** Shown on the PostPin Guides page after "Start" when it can't start right there */
	restartHint: string;
	/**
	 * How the PostPin Guides page starts it: on the page it runs on (`href`), right there on the
	 * guides page (`here`), or else by bringing back its guide button (see `restartHint`)
	 */
	startFrom?: { href: "/(root)/dashboard" } | "here";
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
		restartHint: "Its guide button is back next to the dashboard button in the header.",
	},
	{
		id: "share-link",
		type: "tour",
		trigger: "manual",
		title: "Share links",
		description: "Share an export with people who don't have an account.",
		restartHint: "Its guide button is back next to the share button of an export you may share.",
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
	},
	tour: {
		label: "Tour",
		badge: "badge-accent",
		button: "btn-accent",
		text: "text-accent",
		ring: "ring-accent",
		border: "border-l-accent",
		dot: "bg-accent",
	},
} as const satisfies Record<GuideType, Record<string, string>>;

/** The attribute a guide step points at: `data-guide="<guide-id>/<step-id>"` */
export const guideAnchor = (guideId: GuideId, stepId: string) => `${guideId}/${stepId}`;
