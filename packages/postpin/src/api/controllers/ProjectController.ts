import { Body, Controller, Get, Path, Post, Route, SuccessResponse } from "tsoa";

interface Project {
	id: string;
	name: string;
}

interface ProjectCreationParams {
	name: string;
}

const dummyProjects: Project[] = [
	{
		id: "_dummyId",
		name: "Irgendein Dummy Projekt",
	},
	{
		id: "_dummyId2",
		name: "Dummy Projekt 2",
	},
];

@Route("v1/projects")
export class ProjectController extends Controller {
	@Get("{projectId}")
	public async getProject(@Path() projectId: number): Promise<Project> {
		const project = dummyProjects.find((p) => p.id === projectId.toString());
		if (!project) {
			this.setStatus(404);
			throw new Error("Project not found");
		}
		return project;
	}

	@Get("")
	public async getProjects(): Promise<Project[]> {
		return dummyProjects;
	}

	@SuccessResponse("201", "Created")
	@Post()
	public async createProject(@Body() requestBody: ProjectCreationParams): Promise<void> {
		this.setStatus(201);

		dummyProjects.push({ id: "_dummyId" + (dummyProjects.length + 1), name: requestBody.name });
	}
}
