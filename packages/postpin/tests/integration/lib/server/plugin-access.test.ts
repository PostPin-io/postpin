import { describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { userMayUsePlugins } from "#lib/server/plugin-access.ts";
import * as f from "../../../helpers/factories.ts";

const { OWNER, MEMBER, REVIEWER } = Role;

describe("userMayUsePlugins (device sign-in of a plugin)", () => {
	it("refuses a reviewer in every organization", async () => {
		const m = await f.createMember(await f.createOrg(), REVIEWER);
		await f.createMember(await f.createOrg(), REVIEWER, m.user);
		expect(await userMayUsePlugins(m.userId)).toBe(false);
	});

	it("lets in a reviewer who is a member somewhere else", async () => {
		const m = await f.createMember(await f.createOrg(), REVIEWER);
		await f.createMember(await f.createOrg(), MEMBER, m.user);
		expect(await userMayUsePlugins(m.userId)).toBe(true);
	});

	it("lets in members and up", async () => {
		const m = await f.createMember(await f.createOrg(), OWNER);
		expect(await userMayUsePlugins(m.userId)).toBe(true);
	});

	it("lets in someone without an organization yet", async () => {
		const u = await f.createUser();
		expect(await userMayUsePlugins(u.id)).toBe(true);
	});
});
