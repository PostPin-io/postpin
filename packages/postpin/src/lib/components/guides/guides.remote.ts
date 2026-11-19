import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { Prisma } from "@postpin-io/shared/db";
import { GuideStatus } from "@postpin-io/shared/db/enums";
import { prisma } from "#lib/server/database.ts";
import { accessChecker, accessibleExports, getActiveMember } from "#lib/server/org-access.ts";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";
import { GUIDE_IDS, type GuideId } from "#lib/guides.ts";

// All of these are about the signed-in user's own progress: no target to authorize, but a session
// is a must (/_app/remote/ is a public path).
function requireUser() {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	return user;
}

export interface GuideProgressEntry {
	status: GuideStatus;
	step: string | null;
	context: Record<string, string> | null;
}

/** The user's progress by guide id; a guide without an entry was never started */
export const getGuideProgress = query(async () => {
	const { id } = requireUser();
	const rows = await prisma.guideProgress.findMany({
		where: { userId: id, guideId: { in: GUIDE_IDS } },
		select: { guideId: true, status: true, step: true, context: true },
	});
	return Object.fromEntries(
		rows.map((r) => [
			r.guideId,
			{
				status: r.status,
				step: r.step,
				context: (r.context ?? null) as Record<string, string> | null,
			},
		]),
	) as Partial<Record<GuideId, GuideProgressEntry>>;
});

/** Ids the guide made on the way (a project, a timeline); only short strings */
const Context = v.record(v.pipe(v.string(), v.maxLength(64)), v.pipe(v.string(), v.maxLength(200)));

export const saveGuideProgress = command(
	v.object({
		guideId: v.picklist(GUIDE_IDS),
		status: v.enum(GuideStatus),
		step: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(64)))),
		context: v.optional(v.nullable(Context)),
	}),
	async ({ guideId, status, step, context }) => {
		const { id } = requireUser();
		// Done or skipped: nothing left to resume
		const finished = status !== GuideStatus.STARTED;
		const data = {
			status,
			step: finished ? null : (step ?? null),
			// left out: keeps the stored context; a Json column is cleared with DbNull, not null
			context: finished || context === null ? Prisma.DbNull : context,
		};
		await prisma.guideProgress.upsert({
			where: { userId_guideId: { userId: id, guideId } },
			create: { userId: id, guideId, ...data },
			update: data,
		});
		await getGuideProgress().refresh();
	},
);

/** PostPin Guides page: as if never started (a tour gets its guide button back) */
export const restartGuide = command(v.picklist(GUIDE_IDS), async (guideId) => {
	const { id } = requireUser();
	await prisma.guideProgress.deleteMany({ where: { userId: id, guideId } });
	await getGuideProgress().refresh();
});

/** Off: nothing starts on its own and there are no guide buttons; the guides page still works */
export const getGuidesEnabled = query(async () => {
	const { id } = requireUser();
	const { guidesEnabled } = await prisma.user.findUniqueOrThrow({
		where: { id },
		select: { guidesEnabled: true },
	});
	return guidesEnabled;
});

export const setGuidesEnabled = command(v.boolean(), async (enabled) => {
	const { id } = requireUser();
	await prisma.user.update({ where: { id }, data: { guidesEnabled: enabled } });
	await getGuidesEnabled().refresh();
});

/**
 * Whether a guide can run for the user right now; guides not listed always can. Their guide
 * buttons only show when it can: navigation walks into a real export, so it needs one.
 */
/**
 * Where the PostPin Guides page sends a tour that starts at a feature deep in the app, or null when
 * the user has nothing to start it on. share-link: the latest export the user may share.
 */
export const getGuideStart = query(v.picklist(GUIDE_IDS), async (guideId) => {
	requireUser();
	if (guideId !== "share-link") return null;
	const member = await getActiveMember();
	if (!member) return null;
	const allowed = await accessChecker(member);
	// sharing is decided per project/timeline: look through the latest ones, not all
	const exports = await prisma.export.findMany({
		where: accessibleExports(member),
		select: { id: true, timeline: { select: { id: true, projectId: true } } },
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	const exp = exports.find((e) =>
		allowed("shareLink", "create", { projectId: e.timeline.projectId, timelineId: e.timeline.id }),
	);
	return exp
		? `/projects/${exp.timeline.projectId}/timelines/${exp.timeline.id}/exports/${exp.id}`
		: null;
});

/**
 * When the user last signed in a plugin (a device-flow session of that client, still valid), or
 * null. The install tutorials poll it: signing in is the one step of an install the web app sees.
 */
export const getPluginSignIn = query(
	v.picklist(Object.keys(DEVICE_CLIENTS) as [string, ...string[]]),
	async (clientId) => {
		const { id } = requireUser();
		const session = await prisma.session.findFirst({
			where: { userId: id, clientId, expiresAt: { gt: new Date() } },
			select: { createdAt: true },
			orderBy: { createdAt: "desc" },
		});
		return session?.createdAt.toISOString() ?? null;
	},
);

export const getGuideAvailability = query(async () => {
	requireUser();
	const member = await getActiveMember();
	const anExport = member
		? await prisma.export.findFirst({ where: accessibleExports(member), select: { id: true } })
		: null;
	return { navigation: !!anExport } as Partial<Record<GuideId, boolean>>;
});
