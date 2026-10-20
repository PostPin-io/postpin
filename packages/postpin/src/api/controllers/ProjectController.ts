import { prisma } from "#lib/server/database.ts";
import { Controller, Get, Path, Response, Route } from "tsoa";
import { HttpError } from "../HttpError.ts";

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

@Route("v1/projects")
export class ProjectController extends Controller {
	@Get("")
	public async getProjects(): Promise<Project[]> {
		return prisma.project.findMany({
			select: {
				id: true,
				name: true,
				createdAt: true,
				updatedAt: true,
				nleProjectId: true,
			},
			orderBy: { updatedAt: "desc" },
		});
	}

	@Get("{projectId}")
	@Response(404, "Project not found")
	public async getProject(@Path() projectId: string): Promise<ProjectWithTimelines> {
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				createdAt: true,
				updatedAt: true,
				nleProjectId: true,
				timelines: {
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
