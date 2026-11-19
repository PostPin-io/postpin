import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { Prisma } from "@postpin-io/shared/db";
import { GuideStatus } from "@postpin-io/shared/db/enums";
import { prisma } from "#lib/server/database.ts";
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

/** PostPin Guides page: as if never started, so it starts on its own again */
export const restartGuide = command(v.picklist(GUIDE_IDS), async (guideId) => {
	const { id } = requireUser();
	await prisma.guideProgress.deleteMany({ where: { userId: id, guideId } });
	await getGuideProgress().refresh();
});
