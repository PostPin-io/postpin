import { prisma } from "#lib/server/database.ts";
import { getRequestEvent, query } from "$app/server";
import * as valibot from "valibot";

export const getProjects = query(async () => {
	const projects = await prisma.project.findMany();

	return projects;
});
