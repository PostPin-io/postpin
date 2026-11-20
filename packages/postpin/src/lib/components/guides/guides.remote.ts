import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { Prisma } from "@postpin-io/shared/db";
import { GuideStatus } from "@postpin-io/shared/db/enums";
import { prisma } from "#lib/server/database.ts";
import { accessChecker, accessibleExports, getActiveMember } from "#lib/server/org-access.ts";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";
import { GUIDE_IDS, type GuideId } from "#lib/guides.ts";
import { programByClient, programByHost } from "#lib/plugin-programs.ts";
import type { MarkerSetSummary } from "@postpin-io/shared/logic/marker-sets";

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

/** What a guide needs on the export it starts on: sharing it, or leaving markers on it */
const START_RIGHTS = {
	"share-link": ["shareLink", "create"],
	"first-review": ["marker", "create"],
	"marker-ranges": ["marker", "create"],
} as const;

/**
 * Where the PostPin Guides page sends a guide that starts on an export, or null when the user has
 * nothing to start it on: the latest export they may use it on (see START_RIGHTS).
 */
export const getGuideStart = query(v.picklist(GUIDE_IDS), async (guideId) => {
	requireUser();
	// full screen, from the dashboard: it only needs an export with markers to bring over
	if (guideId === "sync-to-nle") {
		const member = await getActiveMember();
		return member && (await exportWithMarkers(member)) ? "/dashboard" : null;
	}
	if (!(guideId in START_RIGHTS)) return null;
	const [area, action] = START_RIGHTS[guideId as keyof typeof START_RIGHTS];
	const member = await getActiveMember();
	if (!member) return null;
	const allowed = await accessChecker(member);
	// rights are decided per project/timeline: look through the latest ones, not all
	const exports = await prisma.export.findMany({
		where: accessibleExports(member),
		select: { id: true, timeline: { select: { id: true, projectId: true } } },
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	const exp = exports.find((e) =>
		allowed(area, action, { projectId: e.timeline.projectId, timelineId: e.timeline.id }),
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

type ActiveMember = NonNullable<Awaited<ReturnType<typeof getActiveMember>>>;

/**
 * The export the plugin tutorial (sync-to-nle) brings markers from: the latest one with markers
 * where the member may use the plugins. Deleted markers are gone for real, so they don't count.
 */
async function exportWithMarkers(member: ActiveMember) {
	const allowed = await accessChecker(member);
	const exports = await prisma.export.findMany({
		where: { ...accessibleExports(member), markers: { some: {} } },
		select: {
			id: true,
			name: true,
			timeline: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
		},
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	return (
		exports.find((e) =>
			allowed("plugin", "use", { projectId: e.timeline.project.id, timelineId: e.timeline.id }),
		) ?? null
	);
}

const exportHref = (projectId: string, timelineId: string, exportId: string) =>
	`/projects/${projectId}/timelines/${timelineId}/exports/${exportId}`;

/**
 * What the plugin tutorial (sync-to-nle) needs, polled while it waits for a sync: the program of
 * the connected plugin, the export to bring markers from, and the user's latest marker sets. The
 * marker sets are the trace a sync leaves: a PULL set for "to the program", a PUSH set with an
 * added or changed marker for "to PostPin". The tutorial compares their ids with the ones from
 * when its step began, so only what happens after that counts.
 */
export const getPluginTutorial = query(async () => {
	const { id } = requireUser();
	const member = await getActiveMember();
	const [exp, sets, session] = await Promise.all([
		member ? exportWithMarkers(member) : null,
		prisma.markerSet.findMany({
			where: { createdById: id, action: { in: ["PUSH", "PULL"] } },
			select: {
				id: true,
				action: true,
				hostName: true,
				summary: true,
				exportId: true,
				timeline: { select: { id: true, projectId: true } },
			},
			orderBy: { createdAt: "desc" },
			take: 20,
		}),
		prisma.session.findFirst({
			where: {
				userId: id,
				clientId: { in: Object.keys(DEVICE_CLIENTS) },
				expiresAt: { gt: new Date() },
			},
			select: { clientId: true },
			orderBy: { createdAt: "desc" },
		}),
	]);
	const pull = sets.find((s) => s.action === "PULL");
	// a push that only deleted or linked markers doesn't carry the marker the user just added
	const push = sets.find((s) => {
		const side = (s.summary as MarkerSetSummary).postpin;
		return s.action === "PUSH" && !!side && side.added + side.updated > 0;
	});
	// The latest sync says which program the user works in; before the first one, the latest sign-in
	const program =
		programByHost(sets[0]?.hostName)?.hostName ?? programByClient(session?.clientId)?.hostName;
	return {
		/** a plugin is signed in (a valid session of a plugin client) */
		connected: !!session,
		/** hostName of plugin-programs.ts, null when nothing says which program */
		program: program ?? null,
		export: exp
			? {
					project: exp.timeline.project.name,
					timeline: exp.timeline.name,
					name: exp.name,
					href: exportHref(exp.timeline.project.id, exp.timeline.id, exp.id),
				}
			: null,
		pullId: pull?.id ?? null,
		push: push
			? {
					id: push.id,
					href: push.exportId
						? exportHref(push.timeline.projectId, push.timeline.id, push.exportId)
						: null,
				}
			: null,
	};
});

/**
 * Whether a guide can run for the user right now; guides not listed always can. Their guide
 * buttons only show when it can: navigation walks into a real export, so it needs one.
 */
export const getGuideAvailability = query(async () => {
	requireUser();
	const member = await getActiveMember();
	const [anExport, withMarkers] = member
		? await Promise.all([
				prisma.export.findFirst({ where: accessibleExports(member), select: { id: true } }),
				exportWithMarkers(member),
			])
		: [null, null];
	return { navigation: !!anExport, "sync-to-nle": !!withMarkers } as Partial<
		Record<GuideId, boolean>
	>;
});
