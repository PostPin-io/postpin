/**
 * PostPin Guides: tutorials teach the essential mechanics step by step (full screen), tours explain a
 * single feature (popovers, everything else dimmed). What each guide does is specified in
 * docs/guides/; the ids here are the file names there and the keys of the stored progress.
 */

import { Role } from "@postpin-io/shared/db/enums";
import { hasRoleOrHigher, roleAllows, type Action, type Area } from "#lib/roles.ts";

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
	/**
	 * The lowest role in the active organization that can do the guide at all, e.g. Member for
	 * anything with an upload (docs/guides/README.md, rule 17). Lower roles see it greyed out.
	 */
	minRole: Role;
	/**
	 * The right of the permission matrix it is about, when there is one: `minRole` must be the
	 * lowest role that has it (checked by a test, so the two can't drift apart)
	 */
	permission?: { [A in Area]: [A, Action<A>] }[Area];
	/** Also for someone in no organization yet: first-upload creates one, as its owner */
	withoutOrganization?: true;
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
		minRole: Role.MEMBER,
		permission: ["project", "create"],
		withoutOrganization: true,
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
		minRole: Role.REVIEWER,
	},
	{
		id: "install-premiere",
		type: "tutorial",
		trigger: "automatic",
		title: "Installing the Premiere Pro plugin",
		description: "Install the PostPin panel in Premiere Pro on macOS or Windows and sign it in.",
		restartHint: "Starts right here.",
		startFrom: "here",
		minRole: Role.REVIEWER,
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
		minRole: Role.REVIEWER,
	},
	{
		id: "postpin-guides",
		type: "tour",
		trigger: "automatic",
		title: "PostPin Guides",
		description: "How guides work: the guide buttons, this page, and switching guides off.",
		restartHint: "Starts right here.",
		startFrom: "here",
		minRole: Role.REVIEWER,
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
		minRole: Role.REVIEWER,
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
		minRole: Role.MEMBER,
		permission: ["shareLink", "create"],
	},
] as const satisfies readonly Guide[];

export type GuideId = (typeof GUIDES)[number]["id"];

/**
 * Whether the user's role lets them do the guide at all (rule 17). Without an organization there
 * is no role: only what everyone can do, and what creates the organization.
 */
export function roleCanDo(guide: Guide, role: Role | null): boolean {
	if (guide.minRole === Role.REVIEWER) return true;
	if (role === null) return !!guide.withoutOrganization;
	return hasRoleOrHigher(role, guide.minRole);
}

/** The lowest role that has the matrix right, for checking `minRole` against it */
export function lowestRoleWith(permission: NonNullable<Guide["permission"]>): Role | null {
	const ranked = [Role.REVIEWER, Role.MEMBER, Role.ADMIN, Role.OWNER];
	const [area, action] = permission;
	return ranked.find((r) => roleAllows(r, area, action as never)) ?? null;
}
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
