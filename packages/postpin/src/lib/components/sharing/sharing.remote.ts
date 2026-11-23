import { error } from "@sveltejs/kit";
import { getRequestEvent, query } from "$app/server";
import { prisma } from "#lib/server/database.ts";
import * as v from "valibot";
import { authorize } from "#lib/server/org-access.ts";

// The most specific id given decides what is being shared: export, then timeline, then project.
// An organization on its own: invitations into the whole organization.
export const getSharingTarget = query(
	v.union([
		v.object({ organizationId: v.string() }),
		v.object({
			projectId: v.string(),
			timelineId: v.optional(v.string()),
			exportId: v.optional(v.string()),
		}),
	]),
	async (input) => {
		const { user } = getRequestEvent().locals;
		if (!user) error(401, "Not signed in");

		if ("organizationId" in input) {
			// Only who may invite into the organization itself (admins and owners) gets here
			await authorize("invitation", "create", { type: "organization", id: input.organizationId });
			const org = await prisma.organization.findUnique({
				where: { id: input.organizationId },
				select: { id: true, name: true, slug: true },
			});
			if (!org) error(404, "Organization not found");
			return {
				type: "organization" as const,
				id: org.id,
				name: org.name,
				organizationSlug: org.slug,
			};
		}
		const { projectId, timelineId, exportId } = input;

		const projectWhere = {
			id: projectId,
			organization: { members: { some: { userId: user.id } } },
		};

		if (exportId && timelineId) {
			const exp = await prisma.export.findFirst({
				where: { id: exportId, timelineId, timeline: { projectId, project: projectWhere } },
				select: { id: true, name: true, timeline: { select: { name: true } } },
			});
			if (!exp) error(404, "Export not found");
			await authorize("export", "read", { type: "export", id: exportId });
			return {
				type: "export" as const,
				id: exp.id,
				name: exp.name,
				timelineName: exp.timeline.name,
			};
		}

		if (timelineId) {
			const timeline = await prisma.timeline.findFirst({
				where: { id: timelineId, projectId, project: projectWhere },
				select: {
					id: true,
					name: true,
					project: { select: { organization: { select: { slug: true } } } },
				},
			});
			await authorize("timeline", "read", { type: "timeline", id: timelineId });
			if (!timeline) error(404, "Timeline not found");
			return {
				type: "timeline" as const,
				id: timeline.id,
				name: timeline.name,
				organizationSlug: timeline.project.organization.slug,
			};
		}

		const project = await prisma.project.findFirst({
			where: projectWhere,
			select: { id: true, name: true, organization: { select: { slug: true } } },
		});
		if (!project) error(404, "Project not found");
		await authorize("project", "read", { type: "project", id: projectId });
		return {
			type: "project" as const,
			id: project.id,
			name: project.name,
			organizationSlug: project.organization.slug,
		};
	},
);
