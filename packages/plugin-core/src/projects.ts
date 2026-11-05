import { getProject, getProjects } from "@postpin-io/api-client-ts";
import type { Client } from "@postpin-io/api-client-ts/client";

// The project list has no timelines, so each project is loaded on its own
export async function loadProjectsWithTimelines(client: Client) {
	const { data: projects } = await getProjects({ client, throwOnError: true });
	const withTimelines = await Promise.all(
		projects.map(async (project) => {
			const { data } = await getProject({ client, path: { projectId: project.id } });
			// the organization is only in the list response
			return data && { ...data, organization: project.organization };
		}),
	);
	return withTimelines.filter((project) => project !== undefined);
}
