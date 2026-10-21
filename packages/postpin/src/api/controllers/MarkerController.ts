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
		await prisma.marker.createMany({
			data: markers.map((marker) => ({
				...marker,
				exportId,
				authorId,
				categoryId: marker.categoryId,
				nleId: marker.nleId ?? undefined,
			})),
		});
	}
}

type UploadMarker = {
	name: string;
	description: string | null;
	frame: number;
	categoryId: string;
	nleId?: string | null;
};
