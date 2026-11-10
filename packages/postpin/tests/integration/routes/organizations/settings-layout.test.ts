import { beforeEach, describe, expect, it } from "vitest";
import { isRedirect } from "@sveltejs/kit";
import { Role } from "@postpin-io/shared/db/enums";
import { load as layoutLoad } from "../../../../src/routes/(root)/organizations/[organization]/settings/+layout.server.ts";
import { load as pageLoad } from "../../../../src/routes/(root)/organizations/[organization]/settings/+page.server.ts";
import { expectStatus } from "../../../helpers/expect.ts";
import * as f from "../../../helpers/factories.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

async function world() {
	const org = await f.createOrg({ name: "Acme" });
	const other = await f.createOrg({ name: "Other" });
	const owner = await f.createMember(org, OWNER);
	const admin = await f.createMember(org, ADMIN);
	const member = await f.createMember(org, MEMBER);
	const reviewer = await f.createMember(org, REVIEWER);
	const otherOwner = await f.createMember(other, OWNER);
	return { org, other, owner, admin, member, reviewer, otherOwner };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

type User = { id: string; email: string; name: string };

const runLayout = (user: User | null, slug = w.org.slug) =>
	layoutLoad({ params: { organization: slug }, locals: { user } } as never) as Promise<{
		canEditSettings: boolean;
	}>;

const runPage = (canEditSettings: boolean, slug = w.org.slug) =>
	pageLoad({
		params: { organization: slug },
		parent: async () => ({ canEditSettings }),
	} as never);

// ─── settings/+layout.server.ts ─────────────────────────────────────────────

describe("settings layout load", () => {
	it("401 when not signed in", async () => {
		await expectStatus(runLayout(null), 401);
	});

	it("404 for an organization the user isn't a member of", async () => {
		await expectStatus(runLayout(w.otherOwner.user), 404);
	});

	it("404 for an unknown organization", async () => {
		await expectStatus(runLayout(w.owner.user, "does-not-exist"), 404);
	});

	it.each([
		["owner", true],
		["admin", true],
		["member", false],
		["reviewer", false],
	] as const)("%s → canEditSettings %s", async (who, expected) => {
		const data = await runLayout(w[who].user);
		expect(data.canEditSettings).toBe(expected);
	});
});

// ─── settings/+page.server.ts ───────────────────────────────────────────────

describe("settings page load", () => {
	it("lets owners and admins see the general settings", async () => {
		await expect(runPage(true)).resolves.toBeUndefined();
	});

	it("sends everyone else to the members tab", async () => {
		try {
			await runPage(false);
			expect.fail("expected a redirect");
		} catch (e) {
			if (!isRedirect(e)) throw e;
			expect(e.status).toBe(307);
			expect(e.location).toBe(`/organizations/${w.org.slug}/settings/members`);
		}
	});
});
