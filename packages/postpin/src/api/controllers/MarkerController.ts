import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Get, Path, Put, Response, Route, Security } from "tsoa";
import { HttpError } from "../HttpError.ts";
import type { Marker, Response as MarkerResponse } from "@postpin-io/shared/db";
import { apiAuthorize } from "../access.ts";
import { can } from "#lib/roles.ts";

/** Every marker costs up to three queries in the upload transaction */
const MAX_UPLOAD_MARKERS = 2000;

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
		if (markers.length > MAX_UPLOAD_MARKERS) {
			throw new HttpError(400, `Too many markers, ${MAX_UPLOAD_MARKERS} is the limit`);
		}

		const { user, member, target } = await apiAuthorize("marker", "create", {
			type: "export",
			id: exportId,
		});
		const timelineExport = await prisma.export.findUnique({
			where: { id: exportId },
			select: {
				timeline: {
					select: {
						id: true,
						projectId: true,
					},
				},
			},
		});
		if (
			!timelineExport ||
			timelineExport.timeline.id !== timelineId ||
			timelineExport.timeline.projectId !== projectId
		) {
			throw new HttpError(404, "Export not found");
		}

		const ids = [...new Set(markers.map((m) => m.categoryId))];
		const n = await prisma.category.count({
			where: { id: { in: ids }, projectId: target.projectId! },
		});
		if (n !== ids.length) throw new HttpError(400, "Unknown category");

		// Matching markers get updated (and may lose their nleId), so roles that may only update their
		// own markers must not match anyone else's. Markers without author count as foreign.
		if (!can(member.role, "marker", "update", { hasGrant: true })) {
			const markerIds = markers.flatMap((m) => (m.id ? [m.id] : []));
			const nleIds = markers.flatMap((m) => (m.nleId ? [m.nleId] : []));
			const foreign = await prisma.marker.count({
				where: {
					exportId,
					AND: [
						{ OR: [{ id: { in: markerIds } }, { nleId: { in: nleIds } }] },
						{ OR: [{ authorId: null }, { authorId: { not: user.id } }] },
					],
				},
			});
			if (foreign > 0) throw new HttpError(403, "You can only update your own markers");
		}

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
		});
	}
}

type UploadMarker = {
	name: string;
	description: string | null;
	frame: number;
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
