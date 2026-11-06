import { Role } from "@postpin-io/shared/db/enums";
import * as f from "./factories.ts";
import { signInApi } from "./api.ts";

/**
 * Test world for the API controllers: one org with two projects (A with timelines tl1 and tl2,
 * B with tlB), an export per timeline, a category and a marker in project A, and a second org
 * with its own project/timeline/export for isolation checks.
 */
export async function apiWorld() {
	const org = await f.createOrg();
	const other = await f.createOrg();

	const owner = await f.createMember(org, Role.OWNER);
	const projectA = await f.createProject(org, { creator: owner.user });
	const projectB = await f.createProject(org);
	const tl1 = await f.createTimeline(projectA);
	const tl2 = await f.createTimeline(projectA);
	const tlB = await f.createTimeline(projectB);
	const exp1 = await f.createExport(tl1);
	const exp2 = await f.createExport(tl2);
	const expB = await f.createExport(tlB);
	const category = await f.createCategory(projectA, { createdBy: owner.user });
	const marker1 = await f.createMarker(exp1, category, { author: owner.user, frame: 10 });

	const otherOwner = await f.createMember(other, Role.OWNER);
	const otherProject = await f.createProject(other);
	const otherTimeline = await f.createTimeline(otherProject);
	const otherExport = await f.createExport(otherTimeline);
	const otherCategory = await f.createCategory(otherProject);

	return {
		org,
		other,
		owner,
		otherOwner,
		projectA,
		projectB,
		tl1,
		tl2,
		tlB,
		exp1,
		exp2,
		expB,
		category,
		marker1,
		otherProject,
		otherTimeline,
		otherExport,
		otherCategory,
	};
}

export type ApiWorld = Awaited<ReturnType<typeof apiWorld>>;

/**
 * New member of `w.org` with `role`, optionally granted on a project or timeline, signed in
 * with `w.org` as the active org.
 */
export async function signInAs(
	w: ApiWorld,
	role: Role,
	grantOn?: { projectId: string } | { timelineId: string },
) {
	const m = await f.createMember(w.org, role);
	if (grantOn) await f.grant(m, grantOn);
	await signInApi(m.user, w.org.id);
	return m;
}
