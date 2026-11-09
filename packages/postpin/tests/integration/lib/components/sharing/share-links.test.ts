import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	createShareLink,
	getShareLinks,
	revokeShareLink,
	updateShareLink,
} from "#lib/components/sharing/share-links.remote.ts";
import { contentWorld, signInAs, type ContentWorld } from "../../../../helpers/content-world.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { ADMIN, MEMBER, REVIEWER } = Role;

let w: ContentWorld;
beforeEach(async () => {
	w = await contentWorld();
});

const linkOf = (id: string) => prisma.shareLink.findUniqueOrThrow({ where: { id } });

describe("createShareLink", () => {
	it("401 when signed out", async () => {
		signOut();
		await expectStatus(createShareLink({ exportId: w.exp1.id, preset: "7d" }), 401);
	});

	it("creates with defaults and the guest category", async () => {
		signIn(w.owner.user, w.org.id);
		const { id } = await createShareLink({ exportId: w.exp1.id, preset: "24h", note: "  Hi  " });

		const link = await linkOf(id);
		expect(link).toMatchObject({
			creatorId: w.owner.user.id,
			timelinePanelVisible: false,
			markerPanelVisible: true,
			note: "Hi",
			revokedAt: null,
		});
		expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
		expect(
			(await prisma.project.findUniqueOrThrow({ where: { id: w.projectA.id } })).guestCategoryId,
		).not.toBeNull();
	});

	it("403 for a reviewer with access", async () => {
		await signInAs(w.org, REVIEWER, [{ projectId: w.projectA.id }]);
		await expectStatus(createShareLink({ exportId: w.exp1.id, preset: "7d" }), 403);
	});

	it("404 for another org's export", async () => {
		signIn(w.owner.user, w.org.id);
		await expectStatus(createShareLink({ exportId: w.otherExp.id, preset: "7d" }), 404);
	});

	it.each([
		["unknown preset", { preset: "never" }],
		["note too long", { preset: "7d", note: "x".repeat(2001) }],
	])("400 for %s", async (_, data) => {
		signIn(w.owner.user, w.org.id);
		// @ts-expect-error invalid on purpose
		await expectStatus(createShareLink({ exportId: w.exp1.id, ...data }), 400);
	});
});

describe("updateShareLink / revokeShareLink", () => {
	it("a member updates and revokes their own link", async () => {
		const m = await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		const link = await f.createShareLink(w.exp1, { creator: m.user });

		await updateShareLink({ id: link.id, timelinePanelVisible: true, note: "" });
		expect(await linkOf(link.id)).toMatchObject({ timelinePanelVisible: true, note: null });

		await revokeShareLink({ id: link.id });
		expect((await linkOf(link.id)).revokedAt).not.toBeNull();
	});

	it("403 for a member on someone else's link, an admin may", async () => {
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user });

		await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await expectStatus(updateShareLink({ id: link.id, note: "x" }), 403);
		await expectStatus(revokeShareLink({ id: link.id }), 403);

		await signInAs(w.org, ADMIN);
		await updateShareLink({ id: link.id, note: "x" });
		await revokeShareLink({ id: link.id });
	});

	it("409 when updating a revoked link; revoking twice keeps the first time", async () => {
		signIn(w.owner.user, w.org.id);
		const revokedAt = new Date("2026-01-01T00:00:00Z");
		const link = await f.createShareLink(w.exp1, { creator: w.owner.user, revokedAt });

		await expectStatus(updateShareLink({ id: link.id, note: "x" }), 409);
		await revokeShareLink({ id: link.id });
		expect((await linkOf(link.id)).revokedAt).toEqual(revokedAt);
	});

	it("a new preset renews an expired link", async () => {
		signIn(w.owner.user, w.org.id);
		const link = await f.createShareLink(w.exp1, { expiresAt: new Date(Date.now() - 1000) });
		await updateShareLink({ id: link.id, preset: "7d" });
		expect((await linkOf(link.id)).expiresAt.getTime()).toBeGreaterThan(Date.now());
	});
});

describe("getShareLinks", () => {
	it("lists with status and per-link permissions", async () => {
		const own = await signInAs(w.org, MEMBER, [{ projectId: w.projectA.id }]);
		await f.createShareLink(w.exp1, { creator: own.user });
		await f.createShareLink(w.exp1, { creator: w.owner.user, revokedAt: new Date() });

		const links = await getShareLinks(w.exp1.id);
		expect(links.map((l) => [l.status, l.canUpdate, l.canRevoke])).toEqual(
			expect.arrayContaining([
				["active", true, true],
				["revoked", false, false],
			]),
		);
	});
});
