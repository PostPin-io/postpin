/**
 * PostPin Guides: tutorials teach the essential mechanics step by step (full screen), tours explain a
 * single feature (popovers, everything else dimmed). What each guide does is specified in
 * docs/guides/; the ids here are the file names there and the keys of the stored progress.
 */

export type GuideType = "tutorial" | "tour";

export interface Guide {
	id: string;
	type: GuideType;
	title: string;
	/** One sentence for the PostPin Guides page */
	description: string;
	/** Where it starts once started from the PostPin Guides page */
	restartHint: string;
	/** The page it runs on, if there is one to go to right away */
	href?: "/(root)/dashboard";
}

export const GUIDES = [
	{
		id: "first-upload",
		type: "tutorial",
		title: "Your first upload",
		description:
			"Create your organization, a project and a timeline, and upload your first export.",
		restartHint: "Starts on the dashboard.",
		href: "/(root)/dashboard",
	},
	{
		id: "share-link",
		type: "tour",
		title: "Share links",
		description: "Share an export with people who don't have an account.",
		restartHint: "Starts the next time you open an export you may share.",
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
