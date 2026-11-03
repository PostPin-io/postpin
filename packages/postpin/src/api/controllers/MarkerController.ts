import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Get, Path, Put, Response, Route } from "tsoa";
import { HttpError } from "../HttpError.ts";
import type { Marker, Response as MarkerResponse } from "@postpin-io/shared/db";

interface MarkerWithResponses extends Marker {
	responses: MarkerResponse[];
}

@Route("v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers")
export class MarkerController extends Controller {
	@Get("")
	public async getMarkers(
		@Path() projectId: string,
		@Path() timelineId: string,
		@Path() exportId: string,
	): Promise<MarkerWithResponses[]> {
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

		const authorId = await prisma.user
			.findFirstOrThrow({ select: { id: true } })
			.then((user) => user.id);

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
						data: { ...fields, nleId: nleId ?? null, exportId, authorId },
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
