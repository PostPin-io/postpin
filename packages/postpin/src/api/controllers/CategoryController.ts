import { prisma } from "#lib/server/database.ts";
import { Body, Controller, Get, Path, Put, Response, Route, Security } from "@tsoa/runtime";
import { HttpError } from "../HttpError.ts";
import { Prisma, type Category } from "@postpin-io/shared/db";
import { apiAuthorize } from "../access.ts";

@Security("session")
@Route("v1/projects/{projectId}/categories")
export class CategoryController extends Controller {
	@Get("")
	public async getCategories(@Path() projectId: string): Promise<Category[]> {
		await apiAuthorize("category", "read", { type: "project", id: projectId });
		return prisma.category.findMany({
			where: {
				projectId,
			},
		});
	}

	@Put("")
	@Response(404, "Project not found")
	@Response(409, "Category name already exists")
	public async createCategory(
		@Path() projectId: string,
		@Body() body: CategoryCreateParams,
	): Promise<Category> {
		const { user } = await apiAuthorize("category", "create", { type: "project", id: projectId });

		const colorRegex = /^#[0-9A-F]{6}$/i;

		if (!colorRegex.test(body.color)) {
			throw new HttpError(400, "Invalid color format");
		}

		try {
			return await prisma.category.create({
				data: {
					projectId,
					name: body.name,
					color: body.color.toUpperCase(),
					createdById: user.id,
				},
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
				throw new HttpError(409, `Category "${body.name}" already exists`);
			}
			throw err;
		}
	}
}

type CategoryCreateParams = {
	name: string;
	color: string;
};
