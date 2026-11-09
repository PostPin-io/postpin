import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Path, Post, Response, Route, Security } from "tsoa";
import { HttpError } from "../HttpError.ts";
import { apiAuthorize } from "../access.ts";

@Security("session")
@Route("v1/projects/{projectId}/timelines")
export class TimelineController extends Controller {
	@Post("")
	@Response(400, "Invalid name")
	@Response(404, "Project not found")
	public async createTimeline(
		@Path() projectId: string,
		@Body() body: { name: string },
	): Promise<{
		id: string;
		name: string;
		createdAt: Date;
		updatedAt: Date;
		nleTimelineId: string | null;
	}> {
		const name = body.name.trim();
		if (name.length < 1 || name.length > 100) {
			throw new HttpError(400, "Name must be 1-100 characters");
		}
		await apiAuthorize("timeline", "create", { type: "project", id: projectId });

		return prisma.timeline.create({
			data: { name, project: { connect: { id: projectId } } },
			select: { id: true, name: true, createdAt: true, updatedAt: true, nleTimelineId: true },
		});
	}
}
