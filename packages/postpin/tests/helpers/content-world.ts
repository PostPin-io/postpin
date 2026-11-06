import { Role } from "@postpin-io/shared/db/enums";
import * as f from "./factories.ts";
import { signIn } from "./request-event.ts";

/**
 * Content fixture for project / timeline / export / marker tests.
 *
 * org
 * ├─ projectA
 * │  ├─ tl1 → exp1 (with media), exp1b
 * │  ├─ tl2 → exp2
 * │  └─ catA (created by owner)
 * └─ projectB
 *    ├─ tlB → expB
 *    └─ catB (created by owner)
 * other (second org, for isolation)
 * └─ otherProject → otherTl → otherExp, otherCat
 */
export async function contentWorld() {
	const org = await f.createOrg();
	const other = await f.createOrg();

	const owner = await f.createMember(org, Role.OWNER);
	const projectA = await f.createProject(org, { creator: owner.user });
	const projectB = await f.createProject(org, { creator: owner.user });
	const tl1 = await f.createTimeline(projectA);
	const tl2 = await f.createTimeline(projectA);
	const tlB = await f.createTimeline(projectB);
	const exp1 = await f.createExport(tl1, { media: true });
	const exp1b = await f.createExport(tl1);
	const exp2 = await f.createExport(tl2);
	const expB = await f.createExport(tlB);
	const catA = await f.createCategory(projectA, { createdBy: owner.user });
	const catB = await f.createCategory(projectB, { createdBy: owner.user });

	const otherOwner = await f.createMember(other, Role.OWNER);
	const otherProject = await f.createProject(other, { creator: otherOwner.user });
	const otherTl = await f.createTimeline(otherProject);
	const otherExp = await f.createExport(otherTl, { media: true });
	const otherCat = await f.createCategory(otherProject, { createdBy: otherOwner.user });

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
		exp1b,
		exp2,
		expB,
		catA,
		catB,
		otherProject,
		otherTl,
		otherExp,
		otherCat,
	};
}

export type ContentWorld = Awaited<ReturnType<typeof contentWorld>>;

type GrantTarget = { projectId: string } | { timelineId: string };

/** New member of `org` with `role` and the given grants, signed in with `org` active. */
export async function signInAs(org: { id: string }, role: Role, grants: GrantTarget[] = []) {
	const m = await f.createMember(org, role);
	for (const g of grants) await f.grant(m, g);
	signIn(m.user, org.id);
	return m;
}
