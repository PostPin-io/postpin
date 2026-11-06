import { describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { betterAuthRoles } from "#lib/better-auth-roles.ts";
import { DEVICE_CLIENTS } from "#lib/device-clients.ts";

describe("betterAuthRoles", () => {
	it("defines every Role, so better-auth accepts all our role values", () => {
		expect(Object.keys(betterAuthRoles).sort()).toEqual(Object.values(Role).sort());
	});

	it("reviewers get no more than members in better-auth's own access control", () => {
		expect(betterAuthRoles[Role.REVIEWER]).toBe(betterAuthRoles[Role.MEMBER]);
	});
});

describe("DEVICE_CLIENTS", () => {
	it("every client has a display name", () => {
		for (const [id, name] of Object.entries(DEVICE_CLIENTS)) {
			expect(id).toMatch(/^io\.postpin\./);
			expect(name).toBeTruthy();
		}
	});

	it("is not fooled by prototype keys (validateClient uses Object.hasOwn)", () => {
		expect(Object.hasOwn(DEVICE_CLIENTS, "toString")).toBe(false);
	});
});
