import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Get, Path, Post, Put, Response, Route, Security } from "@tsoa/runtime";
import { HttpError } from "../HttpError.ts";
import type { DeletedMarker, Marker, Response as MarkerResponse } from "@postpin-io/shared/db";
import type {
	MarkerSetSummary,
	NleMarkerSnapshotEntry,
} from "@postpin-io/shared/logic/marker-sets";
import { nleSnapshot } from "@postpin-io/shared/logic/marker-sets";
import { isWebUpload } from "@postpin-io/shared/logic/web-upload";
import type { TimelineSnapshot } from "@postpin-io/shared/types/TimelineSnapshot";
import { apiAuthorize } from "../access.ts";
import { notifyMarkers } from "#lib/server/live.ts";
import { createMarkerSet } from "#lib/server/marker-sets.ts";

/** Every marker costs up to three queries in the upload transaction */
const MAX_UPLOAD_MARKERS = 2000;
/** The backup of the NLE side may hold more markers than a push changes */
const MAX_SNAPSHOT_MARKERS = 10000;
/** Large pushes on a remote database take longer than Prisma's default of 5 s */
const SYNC_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

interface MarkerWithResponses extends Marker {
	responses: MarkerResponse[];
}

@Security("session")
@Route("v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers")
export class MarkerController extends Controller {
	@Get("")
	public async getMarkers(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
	): Promise<MarkerWithResponses[]> {
		await apiAuthorize("export", "read", { type: "export", id: exportId });
		return prisma.marker.findMany({
			orderBy: { frame: "desc" },
			include: {
				responses: {
					orderBy: { createdAt: "desc" },
				},
			},
			where: {
				export: {
					id: exportId,
					timeline: {
						id: timelineId,
						projectId,
					},
				},
			},
		});
	}

	@Put("")
	@Response(404, "Export not found")
	public async uploadMarkers(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body()
		markers: UploadMarker[],
	): Promise<void> {
		validateMarkers(markers);

		const { user, target } = await apiAuthorize("marker", "create", {
			type: "export",
			id: exportId,
		});
		await findExport(projectId, timelineId, exportId);
		await assertCategories(markers, target.projectId!);

		// Matching markers get updated, also other people's: fine, as only roles that may update every
		// marker get here (the plugin right starts at Member, see apiAuthorize)
		// Updates the markers the export already has instead of adding them again. A marker matches by
		// id when it came from PostPin (pulled into the NLE before), otherwise by its NLE id.
		await prisma.$transaction(async (tx) => {
			for (const { id, nleId, ...fields } of markers) {
				const existing =
					(id
						? await tx.marker.findFirst({ where: { id, exportId }, select: { id: true } })
						: null) ??
					(nleId
						? await tx.marker.findUnique({
								where: { exportId_nleId: { exportId, nleId } },
								select: { id: true },
							})
						: null);

				if (existing) {
					// A pulled marker takes over the NLE id, which may sit on a copy pushed before the pull
					if (nleId) {
						await tx.marker.updateMany({
							where: { exportId, nleId, id: { not: existing.id } },
							data: { nleId: null },
						});
					}
					await tx.marker.update({
						where: { id: existing.id },
						data: { ...fields, ...(nleId ? { nleId } : {}) },
					});
				} else {
					await tx.marker.create({
						data: { ...fields, nleId: nleId ?? null, exportId, authorId: user.id },
					});
				}
			}
		}, SYNC_TRANSACTION);
		// Browser tabs on this export show the pushed markers right away
		void notifyMarkers(exportId);
	}

	/**
	 * Where the export's frames start, and whether it was uploaded in the browser: such an export
	 * may start at another timecode than the NLE timeline, the plugins then shift the frames
	 */
	@Get("origin")
	public async getMarkerOrigin(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
	): Promise<MarkerOrigin> {
		await apiAuthorize("export", "read", { type: "export", id: exportId });
		await findExport(projectId, timelineId, exportId);
		const exp = await prisma.export.findUniqueOrThrow({
			where: { id: exportId },
			select: { timelineSnapshot: true },
		});
		const snapshot = exp.timelineSnapshot as unknown as TimelineSnapshot | null;
		return {
			startFrameIndex: snapshot?.startFrameIndex ?? null,
			frameRate: snapshot?.frameRate ?? null,
			webUpload: isWebUpload(snapshot),
		};
	}

	/** Markers deleted in PostPin, so a pull can offer to remove them from the NLE too */
	@Get("deleted")
	public async getDeletedMarkers(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
	): Promise<DeletedMarker[]> {
		await apiAuthorize("export", "read", { type: "export", id: exportId });
		await findExport(projectId, timelineId, exportId);
		return prisma.deletedMarker.findMany({ where: { exportId } });
	}

	/**
	 * Push: writes the NLE's changes into the export in one transaction, after a backup of both
	 * sides (a marker set). Markers match by id, else by nleId; deleteIds are markers deleted in the
	 * NLE that the user agreed to delete here too. Returns the backup and every marker's id, in the
	 * order of upserts.
	 */
	@Post("sync")
	@Response(404, "Export not found")
	public async syncMarkers(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: MarkerPush,
	): Promise<MarkerPushResult> {
		validateMarkers(body.upserts);
		if (body.nleMarkers.length > MAX_SNAPSHOT_MARKERS) {
			throw new HttpError(400, `Too many markers, ${MAX_SNAPSHOT_MARKERS} is the limit`);
		}
		const nleIds = body.upserts.flatMap((m) => (m.nleId ? [m.nleId] : []));
		if (new Set(nleIds).size !== nleIds.length) {
			throw new HttpError(400, "Every NLE id may appear only once");
		}

		const { user, target } = await apiAuthorize("marker", "create", {
			type: "export",
			id: exportId,
		});
		if (body.deleteIds.length > 0) {
			await apiAuthorize("marker", "delete", { type: "export", id: exportId });
		}
		await findExport(projectId, timelineId, exportId);
		await assertCategories(body.upserts, target.projectId!);

		const result = await prisma.$transaction(async (tx) => {
			const markerSet = await createMarkerSet(tx, {
				action: "PUSH",
				timelineId,
				exportId,
				nleTimelineId: body.nleTimelineId,
				nleTimelineName: body.nleTimelineName ?? null,
				hostName: body.hostName,
				createdById: user.id,
				summary: body.summary,
				nleMarkers: nleSnapshot(body.nleMarkers),
			});

			const ids = body.upserts.flatMap((m) => (m.id ? [m.id] : []));
			const existing = await tx.marker.findMany({
				where: { exportId, OR: [{ id: { in: ids } }, { nleId: { in: nleIds } }] },
				select: { id: true, nleId: true },
			});
			const byId = new Map(existing.map((m) => [m.id, m.id]));
			const byNleId = new Map(existing.flatMap((m) => (m.nleId ? [[m.nleId, m.id]] : [])));
			// NLE ids move to the markers they now belong to; unique per export
			if (nleIds.length > 0) {
				await tx.marker.updateMany({
					where: { exportId, nleId: { in: nleIds } },
					data: { nleId: null },
				});
			}

			const markers: MarkerPushResult["markers"] = [];
			for (const { id, nleId, syncHash, ...fields } of body.upserts) {
				const match = (id ? byId.get(id) : undefined) ?? (nleId ? byNleId.get(nleId) : undefined);
				const sync = {
					nleId: nleId ?? null,
					nleTimelineId: nleId ? body.nleTimelineId : null,
					syncHash: syncHash ?? null,
				};
				const marker = match
					? await tx.marker.update({
							where: { id: match },
							data: { ...fields, ...sync },
							select: { id: true, nleId: true },
						})
					: await tx.marker.create({
							data: { ...fields, ...sync, exportId, authorId: user.id },
							select: { id: true, nleId: true },
						});
				markers.push(marker);
			}

			const touched = new Set(markers.map((m) => m.id));
			const deleteIds = body.deleteIds.filter((id) => !touched.has(id));
			if (deleteIds.length > 0) {
				await tx.marker.deleteMany({ where: { exportId, id: { in: deleteIds } } });
			}
			// Markers pushed back from the NLE exist again
			await tx.deletedMarker.deleteMany({
				where: {
					exportId,
					OR: [{ markerId: { in: [...touched] } }, { nleId: { in: nleIds } }],
				},
			});
			return { markerSetId: markerSet.id, markers };
		}, SYNC_TRANSACTION);

		void notifyMarkers(exportId);
		return result;
	}

	/**
	 * After a pull: which NLE marker each PostPin marker is now, with the state both sides agree on
	 * (syncHash). forgetDeleted are deleted markers the pull removed from the NLE.
	 */
	@Post("links")
	@Response(404, "Export not found")
	public async linkMarkers(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
		@Body() body: MarkerLinks,
	): Promise<void> {
		if (body.links.length > MAX_SNAPSHOT_MARKERS) {
			throw new HttpError(400, `Too many markers, ${MAX_SNAPSHOT_MARKERS} is the limit`);
		}
		const nleIds = body.links.flatMap((l) => (l.nleId ? [l.nleId] : []));
		if (new Set(nleIds).size !== nleIds.length) {
			throw new HttpError(400, "Every NLE id may appear only once");
		}
		await apiAuthorize("marker", "update", { type: "export", id: exportId });
		await findExport(projectId, timelineId, exportId);

		await prisma.$transaction(async (tx) => {
			if (nleIds.length > 0) {
				await tx.marker.updateMany({
					where: { exportId, nleId: { in: nleIds }, id: { notIn: body.links.map((l) => l.id) } },
					data: { nleId: null },
				});
			}
			for (const link of body.links) {
				// updateMany: a marker deleted in the meantime is skipped instead of failing the rest
				await tx.marker.updateMany({
					where: { id: link.id, exportId },
					data: {
						nleId: link.nleId,
						nleTimelineId: link.nleId ? body.nleTimelineId : null,
						syncHash: link.syncHash,
					},
				});
			}
			if (body.forgetDeleted.length > 0) {
				await tx.deletedMarker.deleteMany({
					where: { exportId, markerId: { in: body.forgetDeleted } },
				});
			}
		}, SYNC_TRANSACTION);
	}
}

type UploadMarker = {
	name: string;
	description: string | null;
	frame: number;
	/**
	 * length in frames, 0 = point marker. Left out: new markers get 0, existing ones keep theirs.
	 * @isInt
	 * @minimum 0
	 */
	duration?: number;
	categoryId: string;
	/**
	 * id of the marker in the NLE, unique per export. Markers with a known nleId are updated.
	 */
	nleId?: string | null;
	/**
	 * PostPin id, for markers that were pulled from PostPin into the NLE. They are updated too.
	 */
	id?: string | null;
};

type SyncMarker = UploadMarker & {
	/** the plugins' hash of the marker as both sides now have it, see MarkerController.linkMarkers */
	syncHash?: string | null;
};

type MarkerPush = {
	/** the NLE timeline the markers come from, see Marker.nleTimelineId */
	nleTimelineId: string;
	nleTimelineName?: string | null;
	/** Capabilities.hostName, e.g. "Resolve" */
	hostName: string;
	/** all of the NLE's markers as they are, for the backup */
	nleMarkers: NleMarkerSnapshotEntry[];
	/** markers to add or update */
	upserts: SyncMarker[];
	/** markers deleted in the NLE that are to be deleted here too */
	deleteIds: string[];
	/** what the push changes, for the history */
	summary: MarkerSetSummary;
};

type MarkerOrigin = {
	/** first frame of the export's timeline, null when unknown */
	startFrameIndex: number | null;
	/** to show the markers' timecodes, null when unknown */
	frameRate: { fpsNumerator: number; fpsDenominator: number; dropFrame: boolean } | null;
	/** uploaded in the browser, not rendered by a plugin from the NLE timeline */
	webUpload: boolean;
};

type MarkerPushResult = {
	/** the backup taken before the push */
	markerSetId: string;
	/** in the order of upserts */
	markers: { id: string; nleId: string | null }[];
};

type MarkerLinks = {
	nleTimelineId: string;
	links: { id: string; nleId: string | null; syncHash: string | null }[];
	/** ids of deleted markers that are no longer in the NLE either */
	forgetDeleted: string[];
};

async function findExport(projectId: string, timelineId: string, exportId: string) {
	const timelineExport = await prisma.export.findUnique({
		where: { id: exportId },
		select: { timeline: { select: { id: true, projectId: true } } },
	});
	if (
		!timelineExport ||
		timelineExport.timeline.id !== timelineId ||
		timelineExport.timeline.projectId !== projectId
	) {
		throw new HttpError(404, "Export not found");
	}
}

function validateMarkers(markers: UploadMarker[]) {
	if (markers.length > MAX_UPLOAD_MARKERS) {
		throw new HttpError(400, `Too many markers, ${MAX_UPLOAD_MARKERS} is the limit`);
	}
	// Frames aren't checked against the export's timeline: an export may cover only part of it
	// (Pro Tools renders the edit selection), but the NLE pushes all of its markers.
	if (markers.some((m) => !(Number.isInteger(m.frame) && m.frame >= 0))) {
		throw new HttpError(400, "Marker frame must be a whole number, 0 or more");
	}
	if (
		markers.some(
			(m) => m.duration !== undefined && !(Number.isInteger(m.duration) && m.duration >= 0),
		)
	) {
		throw new HttpError(400, "Marker duration must be a whole number of frames, 0 or more");
	}
}

async function assertCategories(markers: { categoryId: string }[], projectId: string) {
	const ids = [...new Set(markers.map((m) => m.categoryId))];
	if (ids.length === 0) return;
	const n = await prisma.category.count({ where: { id: { in: ids }, projectId } });
	if (n !== ids.length) throw new HttpError(400, "Unknown category");
}
