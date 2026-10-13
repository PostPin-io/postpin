import { prisma } from "#lib/server/database.ts";
import { Controller, Get, Path, Response, Route } from "tsoa";

interface Project {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
}

interface Timeline {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
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
				timelines: {
					select: { id: true, name: true, createdAt: true, updatedAt: true },
					orderBy: { updatedAt: "desc" },
				},
			},
		});
		if (!project) {
			this.setStatus(404);
			throw new Error("Project not found");
		}
		return project;
	}
}
