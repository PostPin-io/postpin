import { prisma } from "#lib/server/database.ts";
import {
	Body,
	Controller,
	Get,
	Path,
	Post,
	Response,
	Request,
	Route,
	Security,
} from "@tsoa/runtime";
import { HttpError } from "../HttpError.ts";
import type { Request as HapiRequest } from "@hapi/hapi";
import { apiAuthorize } from "../access.ts";
import { accessibleProjects, accessibleTimelines } from "#lib/server/org-access.ts";
import { isOrgWide } from "#lib/roles.ts";

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

	/** Creates a project in the given organization, or in the active one if none is given. */
	@Post("")
	@Response(400, "No active organization")
	public async createProject(
		@Request() request: HapiRequest,
		@Body() body: { name: string; organizationId?: string },
	): Promise<ProjectWithOrg> {
		const name = body.name.trim();
		if (name.length < 1 || name.length > 100) {
			throw new HttpError(400, "Name must be 1-100 characters");
		}
		const organizationId = body.organizationId ?? request.app.locals.session?.activeOrganizationId;
		if (!organizationId) throw new HttpError(400, "No active organization");

		const { user, member } = await apiAuthorize("project", "create", {
			type: "organization",
			id: organizationId,
		});

		return prisma.project.create({
			data: {
				name,
				creatorId: user.id,
				organizationId: member.organizationId,
				...(!isOrgWide(member.role) && {
					memberGrants: { create: { memberId: member.id, createdById: user.id } },
				}),
			},
			select: {
				id: true,
				name: true,
				createdAt: true,
				updatedAt: true,
				nleProjectId: true,
				organization: { select: { id: true, name: true } },
			},
		});
	}
}
