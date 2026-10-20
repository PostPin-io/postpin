import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Get, Path, Put, Response, Route } from "tsoa";
import { HttpError } from "../HttpError.ts";
import type { Category } from "@postpin-io/shared/db";

@Route("v1/projects/{projectId}/categories")
export class CategoryController extends Controller {
	@Get("")
	public async getCategories(@Path() projectId: string): Promise<Category[]> {
		return prisma.category.findMany({
			where: {
				projectId,
			},
		});
	}

	@Put("")
	@Response(404, "Project not found")
	public async createCategory(
		@Path() projectId: string,
		@Body() body: CategoryCreateParams,
	): Promise<Category> {
		const project = await prisma.project.findUnique({
			where: { id: projectId },
		});
		if (project === null) {
			throw new HttpError(404, "Project not found");
		}

		return await prisma.category.create({
			data: {
				projectId,
				name: body.name,
				color: body.color,
			},
		});
	}
}

type CategoryCreateParams = {
	name: string;
	color: string;
};
