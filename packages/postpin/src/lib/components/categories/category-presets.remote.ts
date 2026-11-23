import { prisma } from "#lib/server/database.ts";
import { authorize } from "#lib/server/org-access.ts";
import { notifyCategories } from "#lib/server/live.ts";
import { can } from "#lib/roles.ts";
import { command, query } from "$app/server";
import { Prisma } from "@postpin-io/shared/db";
import { CATEGORY_PRESETS, type PresetCategory } from "@postpin-io/shared/logic/category-presets";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import { getCategories } from "../review/markers/markers.remote.ts";

const MAX_PRESET_CATEGORIES = 100;

const storedCategories = v.array(v.object({ name: v.string(), color: v.string() }));

/** The `categories` JSON of a stored preset; one that doesn't parse counts as empty */
function categoriesOf(json: unknown): PresetCategory[] {
	const parsed = v.safeParse(storedCategories, json);
	return parsed.success ? parsed.output : [];
}

/**
 * The presets a project can be filled from: the built-in ones, then the organization's own.
 * Asked by project, since that is where they are used; a grant in the project is enough.
 */
export const getCategoryPresets = query(v.string(), async (projectId: string) => {
	const { user, member, target } = await authorize("project", "read", {
		type: "project",
		id: projectId,
	});
	// Reached through a project the user has a grant in
	const allowed = (action: "read" | "apply" | "create" | "delete", ownerId?: string | null) =>
		can(member.role, "categoryPreset", action, {
			hasGrant: true,
			isOwn: ownerId != null && ownerId === user.id,
		});
	if (!allowed("read")) error(403, "Not allowed");

	const own = await prisma.categoryPreset.findMany({
		where: { organizationId: target.organizationId },
		orderBy: { name: "asc" },
	});

	return {
		canApply: allowed("apply"),
		canCreate: allowed("create"),
		presets: [
			...CATEGORY_PRESETS.map((p) => ({
				id: p.id as string,
				name: p.name as string,
				description: p.description as string | null,
				builtIn: true,
				canDelete: false,
				categories: [...p.categories] as PresetCategory[],
			})),
			...own.map((p) => ({
				id: p.id,
				name: p.name,
				description: null,
				builtIn: false,
				canDelete: allowed("delete", p.createdById),
				categories: categoriesOf(p.categories),
			})),
		],
	};
});

/** Adds the categories of a preset to the project; names that exist already stay as they are. */
export const applyCategoryPreset = command(
	v.object({
		projectId: v.string(),
		/** Id of a built-in preset or of one of the project's organization */
		preset: v.string(),
	}),
	async (data) => {
		const { user, member, target } = await authorize("category", "create", {
			type: "project",
			id: data.projectId,
		});
		// Creating single categories isn't enough: a preset sets up the whole project's list
		if (!can(member.role, "categoryPreset", "apply", { hasGrant: true })) {
			error(403, "Not allowed");
		}

		const categories: readonly PresetCategory[] | undefined =
			CATEGORY_PRESETS.find((p) => p.id === data.preset)?.categories ??
			(await prisma.categoryPreset
				.findFirst({ where: { id: data.preset, organizationId: target.organizationId } })
				.then((p) => p && categoriesOf(p.categories))) ??
			undefined;
		if (!categories) error(404, "Preset not found");

		const { count } = await prisma.category.createMany({
			data: categories.map((c) => ({
				name: c.name,
				color: c.color,
				projectId: data.projectId,
				createdById: user.id,
			})),
			skipDuplicates: true,
		});
		if (count > 0) void notifyCategories(data.projectId);
		await getCategories(data.projectId).refresh();
		return { created: count, skipped: categories.length - count };
	},
);

/** Saves some of the project's categories as a preset of its organization. */
export const saveCategoryPreset = command(
	v.object({
		projectId: v.string(),
		name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
		categoryIds: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(MAX_PRESET_CATEGORIES)),
	}),
	async (data) => {
		const { user, member, target } = await authorize("project", "read", {
			type: "project",
			id: data.projectId,
		});
		if (!can(member.role, "categoryPreset", "create", { hasGrant: true })) {
			error(403, "Not allowed");
		}
		if (CATEGORY_PRESETS.some((p) => p.name.toLowerCase() === data.name.toLowerCase())) {
			error(409, `Preset "${data.name}" already exists`);
		}

		const ids = [...new Set(data.categoryIds)];
		const categories = await prisma.category.findMany({
			where: { id: { in: ids }, projectId: data.projectId },
			orderBy: { name: "asc" },
			select: { name: true, color: true },
		});
		if (categories.length !== ids.length) error(400, "Category does not belong to this project");

		const preset = await prisma.categoryPreset
			.create({
				data: {
					name: data.name,
					categories,
					organizationId: target.organizationId,
					createdById: user.id,
				},
				select: { id: true },
			})
			.catch((e: unknown): never => {
				if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
					error(409, `Preset "${data.name}" already exists`);
				}
				throw e;
			});
		await getCategoryPresets(data.projectId).refresh();
		return preset;
	},
);

/** Deletes a preset of the project's organization. Built-in presets have no row to delete. */
export const deleteCategoryPreset = command(
	v.object({ projectId: v.string(), id: v.string() }),
	async (data) => {
		const { user, member, target } = await authorize("project", "read", {
			type: "project",
			id: data.projectId,
		});
		const preset = await prisma.categoryPreset.findFirst({
			where: { id: data.id, organizationId: target.organizationId },
			select: { id: true, createdById: true },
		});
		if (!preset) error(404, "Preset not found");
		const isOwn = preset.createdById !== null && preset.createdById === user.id;
		if (!can(member.role, "categoryPreset", "delete", { hasGrant: true, isOwn })) {
			error(403, "Not allowed");
		}

		await prisma.categoryPreset.deleteMany({ where: { id: preset.id } });
		await getCategoryPresets(data.projectId).refresh();
	},
);
