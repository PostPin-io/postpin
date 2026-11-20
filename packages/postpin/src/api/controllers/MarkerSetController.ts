import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Get, Path, Post, Query, Response, Route, Security } from "@tsoa/runtime";
import { HttpError } from "../HttpError.ts";
import type { Prisma } from "@postpin-io/shared/db";
import type {
	MarkerSetSideSummary,
	MarkerSetSummary,
	NleMarkerSnapshot,
	NleMarkerSnapshotEntry,
	PostPinMarkerSnapshot,
} from "@postpin-io/shared/logic/marker-sets";
import { nleSnapshot } from "@postpin-io/shared/logic/marker-sets";
import { apiAuthorize } from "../access.ts";
import { notifyMarkers } from "#lib/server/live.ts";
import { createMarkerSet, restoreExportMarkers } from "#lib/server/marker-sets.ts";

const MAX_SNAPSHOT_MARKERS = 10000;
const LIST_LIMIT = 100;
const RESTORE_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

const listSelect = {
	id: true,
	action: true,
	timelineId: true,
	exportId: true,
	nleTimelineId: true,
	nleTimelineName: true,
	hostName: true,
	createdAt: true,
	summary: true,
	createdBy: { select: { id: true, name: true } },
	export: { select: { name: true } },
} as const;

/**
 * Marker sets: backups the plugins take before every action that changes markers, see
 * #lib/server/marker-sets.ts. A set belongs to the PostPin timeline the plugin worked with.
 */
@Security("session")
@Route("v1/projects/{projectId}/timelines/{timelineId}/marker-sets")
export class MarkerSetController extends Controller {
	/** Newest first, without the markers. nleTimelineId narrows it to one NLE timeline. */
	@Get("")
	public async getMarkerSets(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Query() nleTimelineId?: string,
	): Promise<MarkerSetListItem[]> {
		await apiAuthorize("timeline", "read", { type: "timeline", id: timelineId });
		await findTimeline(projectId, timelineId);
		const sets = await prisma.markerSet.findMany({
			where: { timelineId, ...(nleTimelineId && { nleTimelineId }) },
			orderBy: { createdAt: "desc" },
			take: LIST_LIMIT,
			select: listSelect,
		});
		return sets.map(toListItem);
	}

	@Get("{markerSetId}")
	@Response(404, "Marker set not found")
	public async getMarkerSet(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() markerSetId: string,
	): Promise<MarkerSetDetail> {
		await apiAuthorize("timeline", "read", { type: "timeline", id: timelineId });
		await findTimeline(projectId, timelineId);
		const set = await prisma.markerSet.findFirst({
			where: { id: markerSetId, timelineId },
			select: { ...listSelect, nleMarkers: true, postpinMarkers: true },
		});
		if (!set) throw new HttpError(404, "Marker set not found");
		return {
			...toListItem(set),
			nleMarkers: set.nleMarkers as unknown as NleMarkerSnapshot,
			postpinMarkers: set.postpinMarkers as unknown as PostPinMarkerSnapshot | null,
		};
	}

	/**
	 * Backs up the markers before an action that changes the NLE (pull, delete all, restoring the
	 * NLE). The export's markers are read here; pushes back up on their own (MarkerController.sync).
	 * For delete all, the timeline's markers in PostPin are unlinked from the NLE timeline.
	 */
	@Post("")
	@Response(404, "Timeline or export not found")
	public async createMarkerSet(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Body() body: MarkerSetCreate,
	): Promise<{ id: string }> {
		if (body.nleMarkers.length > MAX_SNAPSHOT_MARKERS) {
			throw new HttpError(400, `Too many markers, ${MAX_SNAPSHOT_MARKERS} is the limit`);
		}
		const { user } = await apiAuthorize("marker", "create", { type: "timeline", id: timelineId });
		await findTimeline(projectId, timelineId);
		if (body.exportId) await findExportOf(timelineId, body.exportId);

		return prisma.$transaction(async (tx) => {
			const set = await createMarkerSet(tx, {
				action: body.action,
				timelineId,
				exportId: body.exportId ?? null,
				nleTimelineId: body.nleTimelineId,
				nleTimelineName: body.nleTimelineName ?? null,
				hostName: body.hostName,
				createdById: user.id,
				summary: body.summary,
				nleMarkers: nleSnapshot(body.nleMarkers),
			});
			// Delete all empties the NLE timeline: its markers in PostPin are no longer in it, and a
			// pull afterwards brings them all back instead of taking them for deleted in the NLE
			if (body.action === "CLEAR") {
				await tx.marker.updateMany({
					where: { export: { timelineId }, nleTimelineId: body.nleTimelineId },
					data: { nleId: null, nleTimelineId: null },
				});
			}
			return set;
		});
	}

	/**
	 * Brings the export's markers back to how they were in the set, after backing up the current
	 * state as a RESTORE set (which can be restored in turn). The NLE side is restored by the plugin.
	 */
	@Post("{markerSetId}/restore")
	@Response(404, "Marker set not found")
	@Response(409, "The marker set has no export to restore")
	public async restoreMarkerSet(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() markerSetId: string,
		@Body() body: MarkerSetRestore,
	): Promise<MarkerSetRestoreResult> {
		if (body.nleMarkers.length > MAX_SNAPSHOT_MARKERS) {
			throw new HttpError(400, `Too many markers, ${MAX_SNAPSHOT_MARKERS} is the limit`);
		}
		await apiAuthorize("timeline", "read", { type: "timeline", id: timelineId });
		await findTimeline(projectId, timelineId);
		const set = await prisma.markerSet.findFirst({
			where: { id: markerSetId, timelineId },
			select: { exportId: true, postpinMarkers: true },
		});
		if (!set) throw new HttpError(404, "Marker set not found");
		if (!set.exportId || !set.postpinMarkers) {
			throw new HttpError(409, "The marker set has no export to restore");
		}
		const exportId = set.exportId;
		// Restoring adds, changes and deletes anyone's markers
		const { user } = await apiAuthorize("marker", "update", { type: "export", id: exportId });
		await apiAuthorize("marker", "delete", { type: "export", id: exportId });

		const result = await prisma.$transaction(async (tx) => {
			const backup = await createMarkerSet(tx, {
				action: "RESTORE",
				timelineId,
				exportId,
				nleTimelineId: body.nleTimelineId,
				nleTimelineName: body.nleTimelineName ?? null,
				hostName: body.hostName,
				createdById: user.id,
				// filled in below, once the restore knows what it changed
				summary: {},
				nleMarkers: nleSnapshot(body.nleMarkers),
			});
			const postpin = await restoreExportMarkers(
				tx,
				exportId,
				projectId,
				set.postpinMarkers as unknown as PostPinMarkerSnapshot,
			);
			const summary: MarkerSetSummary = {
				postpin,
				...(body.nleSummary && { nle: body.nleSummary }),
			};
			await tx.markerSet.update({
				where: { id: backup.id },
				data: { summary: summary as Prisma.InputJsonValue },
			});
			return { markerSetId: backup.id, summary };
		}, RESTORE_TRANSACTION);

		void notifyMarkers(exportId);
		return result;
	}
}

type MarkerSetAction = "PUSH" | "PULL" | "CLEAR" | "RESTORE";

interface MarkerSetListItem {
	id: string;
	action: MarkerSetAction;
	timelineId: string;
	exportId: string | null;
	exportName: string | null;
	nleTimelineId: string;
	nleTimelineName: string | null;
	hostName: string;
	createdAt: Date;
	createdBy: { id: string; name: string } | null;
	summary: MarkerSetSummary;
}

interface MarkerSetDetail extends MarkerSetListItem {
	nleMarkers: NleMarkerSnapshot;
	postpinMarkers: PostPinMarkerSnapshot | null;
}

type MarkerSetCreate = {
	/** PUSH sets are made by the push itself */
	action: "PULL" | "CLEAR" | "RESTORE";
	/** the export the action works on, if any; its markers are backed up too */
	exportId?: string | null;
	nleTimelineId: string;
	nleTimelineName?: string | null;
	hostName: string;
	/** the NLE's markers before the action */
	nleMarkers: NleMarkerSnapshotEntry[];
	summary: MarkerSetSummary;
};

type MarkerSetRestore = {
	nleTimelineId: string;
	nleTimelineName?: string | null;
	hostName: string;
	/** the NLE's markers now, for the backup of the restore */
	nleMarkers: NleMarkerSnapshotEntry[];
	/** what the plugin changes in the NLE when it restores that side too */
	nleSummary?: MarkerSetSideSummary;
};

type MarkerSetRestoreResult = {
	/** the backup of the state before the restore */
	markerSetId: string;
	summary: MarkerSetSummary;
};

function toListItem(set: {
	id: string;
	action: MarkerSetAction;
	timelineId: string;
	exportId: string | null;
	nleTimelineId: string;
	nleTimelineName: string | null;
	hostName: string;
	createdAt: Date;
	summary: unknown;
	createdBy: { id: string; name: string } | null;
	export: { name: string } | null;
}): MarkerSetListItem {
	const { export: exp, summary, ...rest } = set;
	return { ...rest, exportName: exp?.name ?? null, summary: summary as MarkerSetSummary };
}

async function findTimeline(projectId: string, timelineId: string) {
	const timeline = await prisma.timeline.findUnique({
		where: { id: timelineId },
		select: { projectId: true },
	});
	if (!timeline || timeline.projectId !== projectId) {
		throw new HttpError(404, "Timeline not found");
	}
}

async function findExportOf(timelineId: string, exportId: string) {
	const exp = await prisma.export.findUnique({
		where: { id: exportId },
		select: { timelineId: true },
	});
	if (!exp || exp.timelineId !== timelineId) throw new HttpError(404, "Export not found");
}
