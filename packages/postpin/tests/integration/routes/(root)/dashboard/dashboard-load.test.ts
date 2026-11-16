import { describe, expect, it } from "vitest";
import { isRedirect } from "@sveltejs/kit";
import { Role } from "@postpin-io/shared/db/enums";
import { load } from "../../../../../src/routes/(root)/dashboard/+page.server.ts";
import { prisma } from "../../../../helpers/db.ts";
import * as f from "../../../../helpers/factories.ts";

/** The load function as the session handler calls it: the user with their memberships */
async function loadAs(user: { id: string }) {
	const full = await prisma.user.findUniqueOrThrow({
		where: { id: user.id },
		include: { memberships: true },
	});
	try {
		await load({ locals: { user: full } } as unknown as Parameters<typeof load>[0]);
		return null;
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown.location;
		throw thrown;
	}
}

describe("dashboard load", () => {
	it("sends a fresh account to the tutorial", async () => {
		expect(await loadAs(await f.createUser())).toBe("/welcome");
	});

	it("stays on the dashboard once the tutorial was skipped", async () => {
		const user = await f.createUser();
		await prisma.user.update({ where: { id: user.id }, data: { tutorialCompletedAt: new Date() } });
		expect(await loadAs(user)).toBeNull();
	});

	it("stays on the dashboard for members of an organization", async () => {
		const me = await f.createMember(await f.createOrg(), Role.REVIEWER);
		expect(await loadAs(me.user)).toBeNull();
	});
});
