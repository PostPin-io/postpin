import { prisma } from "#lib/server/database.ts";
import { Controller, Get, Path, Response, Request, Route, Security } from "tsoa";
import { HttpError } from "../HttpError.ts";
import type { Request as HapiRequest } from "@hapi/hapi";
import { apiAuthorize } from "../access.ts";
import { accessibleProjects, accessibleTimelines } from "#lib/server/org-access.ts";

interface Project {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	nleProjectId: string | null;
}

interface Timeline {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	nleTimelineId: string | null;
}

interface ProjectWithTimelines extends Project {
	timelines: Timeline[];
}

interface ProjectWithOrg extends Project {
	organization: {
		id: string;
		name: string;
	};
}

@Security("session")
@Route("v1/projects")
export class ProjectController extends Controller {
	@Get("")
	public async getProjects(@Request() request: HapiRequest): Promise<ProjectWithOrg[]> {
		const { memberships } = request.app.locals.user!;
		if (memberships.length === 0) return [];
		return prisma.project.findMany({
			where: { OR: memberships.map(accessibleProjects) },
			select: {
				id: true,
				name: true,
				createdAt: true,
				updatedAt: true,
				nleProjectId: true,
				organization: { select: { id: true, name: true } },
			},
			orderBy: { updatedAt: "desc" },
		});
	}

	@Get("{projectId}")
	@Response(404, "Project not found")
	public async getProject(@Path() projectId: string): Promise<ProjectWithTimelines> {
		const { member } = await apiAuthorize("project", "read", { type: "project", id: projectId });

		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				createdAt: true,
				updatedAt: true,
				nleProjectId: true,
				timelines: {
					where: accessibleTimelines(member),
					select: {
						id: true,
						name: true,
						createdAt: true,
						updatedAt: true,
						nleTimelineId: true,
					},
					orderBy: { updatedAt: "desc" },
				},
			},
		});
		if (!project) {
			throw new HttpError(404, "Project not found");
		}
		return project;
	}
}
