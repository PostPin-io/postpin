import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { getExportList } from "../../../../../../../../../src/routes/(root)/projects/[project]/timelines/[timeline]/exports/exportlist.remote.ts";
import {
	contentWorld,
	signInAs,
	type ContentWorld,
} from "../../../../../../../../helpers/content-world.ts";
import { prisma } from "../../../../../../../../helpers/db.ts";
import { expectStatus } from "../../../../../../../../helpers/expect.ts";
import { signIn, signOut } from "../../../../../../../../helpers/request-event.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;

beforeEach(async () => {
	w = await contentWorld();
});

describe("getExportList", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(getExportList(w.tl1.id), 401);
	});

	it("404 for another org's timeline and for an unknown one", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(getExportList(w.otherTl.id), 404);
		await expectStatus(getExportList("nope"), 404);
	});

	it.each([MEMBER, REVIEWER])("404 for a %s with a grant on another timeline", async (role) => {
		await signInAs(w.org, role, [{ timelineId: w.tl2.id }]);
		await expectStatus(getExportList(w.tl1.id), 404);
	});

	it("only the timeline's exports, newest first, with media", async () => {
		await prisma.export.update({ where: { id: w.exp1.id }, data: { createdAt: new Date(1000) } });
		await prisma.export.update({ where: { id: w.exp1b.id }, data: { createdAt: new Date(2000) } });
		await signInAs(w.org, REVIEWER, [{ timelineId: w.tl1.id }]);

		const list = await getExportList(w.tl1.id);
		expect(list.map((e) => e.id)).toEqual([w.exp1b.id, w.exp1.id]);
		expect(list[1]!.media?.id).toBe(w.exp1.mediaId);
		expect(list[0]!.media).toBeNull();
	});

	it.each([
		[OWNER, [], true],
		[ADMIN, [], true],
		[MEMBER, ["timeline"], true],
		[MEMBER, ["project"], true],
		[REVIEWER, ["project"], false],
	] as const)("%s with %j grant: canRename / canDelete = %s", async (role, grants, expected) => {
		await signInAs(
			w.org,
			role,
			grants.map((g) =>
				g === "project" ? { projectId: w.projectA.id } : { timelineId: w.tl1.id },
			),
		);
		const list = await getExportList(w.tl1.id);
		expect(list.map((e) => [e.canRename, e.canDelete])).toEqual([
			[expected, expected],
			[expected, expected],
		]);
	});
});
