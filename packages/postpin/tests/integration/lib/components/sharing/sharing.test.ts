import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { getSharingTarget } from "#lib/components/sharing/sharing.remote.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { OWNER, MEMBER, REVIEWER } = Role;

async function world() {
	const org = await f.createOrg();
	const other = await f.createOrg();
	const owner = await f.createMember(org, OWNER);
	const projectA = await f.createProject(org, { name: "Alpha" });
	const projectB = await f.createProject(org, { name: "Beta" });
	const tlA = await f.createTimeline(projectA, { name: "Cut A" });
	const tlB = await f.createTimeline(projectB);
	const expA = await f.createExport(tlA, { name: "Export A" });
	const expB = await f.createExport(tlB);
	const otherOwner = await f.createMember(other, OWNER);
	const otherProject = await f.createProject(other);
	const otherTimeline = await f.createTimeline(otherProject);
	const otherExport = await f.createExport(otherTimeline);
	return {
		org,
		other,
		owner,
		projectA,
		projectB,
		tlA,
		tlB,
		expA,
		expB,
		otherOwner,
		otherProject,
		otherTimeline,
		otherExport,
	};
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

const as = (m: { user: { id: string; email: string; name: string } }, orgId = w.org.id) =>
	signIn(m.user, orgId);

describe("getSharingTarget", () => {
	it("401 when not signed in", async () => {
		signOut();
		await expectStatus(getSharingTarget({ projectId: w.projectA.id }), 401);
	});

	it("project", async () => {
		as(w.owner);
		expect(await getSharingTarget({ projectId: w.projectA.id })).toEqual({
			type: "project",
			id: w.projectA.id,
			name: "Alpha",
		});
	});

	it("timeline wins over project", async () => {
		as(w.owner);
		expect(await getSharingTarget({ projectId: w.projectA.id, timelineId: w.tlA.id })).toEqual({
			type: "timeline",
			id: w.tlA.id,
			name: "Cut A",
		});
	});

	it("export wins over timeline", async () => {
		as(w.owner);
		expect(
			await getSharingTarget({
				projectId: w.projectA.id,
				timelineId: w.tlA.id,
				exportId: w.expA.id,
			}),
		).toEqual({ type: "export", id: w.expA.id, name: "Export A" });
	});

	it("404 when the ids don't belong together", async () => {
		as(w.owner);
		await expectStatus(getSharingTarget({ projectId: w.projectA.id, timelineId: w.tlB.id }), 404);
		await expectStatus(
			getSharingTarget({ projectId: w.projectA.id, timelineId: w.tlA.id, exportId: w.expB.id }),
			404,
		);
	});

	it("404 for ids of another org", async () => {
		as(w.owner);
		await expectStatus(getSharingTarget({ projectId: w.otherProject.id }), 404);
		await expectStatus(
			getSharingTarget({ projectId: w.otherProject.id, timelineId: w.otherTimeline.id }),
			404,
		);
		await expectStatus(
			getSharingTarget({
				projectId: w.otherProject.id,
				timelineId: w.otherTimeline.id,
				exportId: w.otherExport.id,
			}),
			404,
		);
	});

	it("404 for an unknown timeline", async () => {
		as(w.owner);
		await expectStatus(getSharingTarget({ projectId: w.projectA.id, timelineId: "nope" }), 404);
	});

	it.each([MEMBER, REVIEWER])("%s without a grant gets 404", async (role) => {
		const m = await f.createMember(w.org, role);
		as(m);
		await expectStatus(getSharingTarget({ projectId: w.projectA.id }), 404);
		await expectStatus(getSharingTarget({ projectId: w.projectA.id, timelineId: w.tlA.id }), 404);
		await expectStatus(
			getSharingTarget({ projectId: w.projectA.id, timelineId: w.tlA.id, exportId: w.expA.id }),
			404,
		);
	});

	it("timeline grant: project and own timeline work, sibling timelines don't", async () => {
		const tlA2 = await f.createTimeline(w.projectA);
		const m = await f.createMember(w.org, REVIEWER);
		await f.grant(m, { timelineId: w.tlA.id });
		as(m);
		expect((await getSharingTarget({ projectId: w.projectA.id })).type).toBe("project");
		expect((await getSharingTarget({ projectId: w.projectA.id, timelineId: w.tlA.id })).type).toBe(
			"timeline",
		);
		await expectStatus(getSharingTarget({ projectId: w.projectA.id, timelineId: tlA2.id }), 404);
	});

	it("400 when projectId is missing", async () => {
		as(w.owner);
		await expectStatus(getSharingTarget({ timelineId: w.tlA.id } as never), 400);
	});
});
