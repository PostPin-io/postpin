import { describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	ACTIONS,
	INVITE_ROLES,
	MANAGER_ROLES,
	ORG_ROLES,
	ROLE_LABELS,
	can,
	canChangeRole,
	canInviteAs,
	canLeave,
	canRemoveMember,
	hasRoleOrHigher,
	isOrgWide,
	roleAllows,
	roleLabel,
	roles,
	toRole,
	type Action,
	type Area,
} from "#lib/roles.ts";

const { OWNER, ADMIN, MEMBER, REVIEWER } = Role;

// ─── Expected matrix ────────────────────────────────────────────────────────
// Written out by hand per role, deliberately without inheritance, so that every
// change to the matrix in roles.ts shows up as a diff here.
//
//   all  = allowed (non-org-wide roles still need a grant on the target)
//   own  = only on resources the user created
//   free = allowed without a grant on the target
//   -    = not allowed

type Rule = "all" | "own" | "free" | "-";
type Matrix = { [A in Area]: { [K in Action<A>]: Rule } };

const EXPECTED: Record<Role, Matrix> = {
	[REVIEWER]: {
		project: { read: "all", create: "-", rename: "-", delete: "-" },
		timeline: { read: "all", create: "-", rename: "-", delete: "-", uploadMetadata: "-" },
		export: { read: "all", upload: "-", rename: "-", delete: "-" },
		marker: { read: "all", create: "all", update: "own", delete: "own", respond: "all" },
		category: { read: "all", create: "all", update: "own", delete: "own" },
		invitation: { read: "-", create: "-", update: "-", delete: "-" },
		inviteLink: { read: "-", create: "-", delete: "-" },
		shareLink: { read: "-", create: "-", update: "-", delete: "-" },
		grant: { create: "-", delete: "-" },
		member: { read: "all", updateRole: "-", remove: "-" },
		organization: { rename: "-", delete: "-", updateSettings: "-" },
	},
	[MEMBER]: {
		project: { read: "all", create: "free", rename: "all", delete: "all" },
		timeline: { read: "all", create: "all", rename: "all", delete: "all", uploadMetadata: "all" },
		export: { read: "all", upload: "all", rename: "all", delete: "all" },
		marker: { read: "all", create: "all", update: "all", delete: "all", respond: "all" },
		category: { read: "all", create: "all", update: "all", delete: "all" },
		invitation: { read: "all", create: "all", update: "own", delete: "own" },
		inviteLink: { read: "all", create: "all", delete: "own" },
		shareLink: { read: "all", create: "all", update: "own", delete: "own" },
		grant: { create: "all", delete: "own" },
		member: { read: "all", updateRole: "-", remove: "-" },
		organization: { rename: "-", delete: "-", updateSettings: "-" },
	},
	[ADMIN]: {
		project: { read: "all", create: "free", rename: "all", delete: "all" },
		timeline: { read: "all", create: "all", rename: "all", delete: "all", uploadMetadata: "all" },
		export: { read: "all", upload: "all", rename: "all", delete: "all" },
		marker: { read: "all", create: "all", update: "all", delete: "all", respond: "all" },
		category: { read: "all", create: "all", update: "all", delete: "all" },
		invitation: { read: "all", create: "all", update: "all", delete: "all" },
		inviteLink: { read: "all", create: "all", delete: "all" },
		shareLink: { read: "all", create: "all", update: "all", delete: "all" },
		grant: { create: "all", delete: "all" },
		member: { read: "all", updateRole: "all", remove: "all" },
		organization: { rename: "-", delete: "-", updateSettings: "all" },
	},
	[OWNER]: {
		project: { read: "all", create: "free", rename: "all", delete: "all" },
		timeline: { read: "all", create: "all", rename: "all", delete: "all", uploadMetadata: "all" },
		export: { read: "all", upload: "all", rename: "all", delete: "all" },
		marker: { read: "all", create: "all", update: "all", delete: "all", respond: "all" },
		category: { read: "all", create: "all", update: "all", delete: "all" },
		invitation: { read: "all", create: "all", update: "all", delete: "all" },
		inviteLink: { read: "all", create: "all", delete: "all" },
		shareLink: { read: "all", create: "all", update: "all", delete: "all" },
		grant: { create: "all", delete: "all" },
		member: { read: "all", updateRole: "all", remove: "all" },
		organization: { rename: "all", delete: "all", updateSettings: "all" },
	},
};

/** Every (area, action) pair from ACTIONS */
const ALL_ACTIONS = (Object.keys(ACTIONS) as Area[]).flatMap((area) =>
	(ACTIONS[area] as readonly string[]).map((action) => ({ area, action })),
) as { area: Area; action: Action<Area> }[];

const expected = (role: Role, area: Area, action: string): Rule =>
	(EXPECTED[role][area] as Record<string, Rule>)[action];

/** All four combinations of the context flags, plus "no context at all" */
const CONTEXTS = [
	undefined,
	{ isOwn: false, hasGrant: false },
	{ isOwn: true, hasGrant: false },
	{ isOwn: false, hasGrant: true },
	{ isOwn: true, hasGrant: true },
];

/** What `can()` must answer for a rule, derived from the legend above */
function expectedCan(role: Role, rule: Rule, ctx: (typeof CONTEXTS)[number]) {
	if (rule === "-") return false;
	const isOwn = ctx?.isOwn === true;
	const hasGrant = ctx?.hasGrant === true;
	const grantOk = isOrgWide(role) || rule === "free" || hasGrant;
	const ownOk = rule !== "own" || isOwn;
	return grantOk && ownOk;
}

describe("expected matrix", () => {
	it("covers exactly the actions in ACTIONS, for every role", () => {
		for (const role of ORG_ROLES) {
			for (const area of Object.keys(ACTIONS) as Area[]) {
				expect(Object.keys(EXPECTED[role][area]).sort(), `${role}.${area}`).toEqual(
					[...ACTIONS[area]].sort(),
				);
			}
		}
	});
});

describe("roles matrix", () => {
	it("has an entry for every role", () => {
		expect(Object.keys(roles).sort()).toEqual(Object.values(Role).sort());
	});

	it("only contains areas and actions that exist in ACTIONS", () => {
		for (const role of ORG_ROLES) {
			for (const [area, rules] of Object.entries(roles[role])) {
				expect(ACTIONS, `${role}: unknown area ${area}`).toHaveProperty(area);
				for (const action of Object.keys(rules ?? {})) {
					expect(ACTIONS[area as Area], `${role}.${area}: unknown action`).toContain(action);
				}
			}
		}
	});
});

describe.each(ORG_ROLES)("%s", (role) => {
	it.each(ALL_ACTIONS)("roleAllows $area.$action", ({ area, action }) => {
		expect(roleAllows(role, area, action)).toBe(expected(role, area, action) !== "-");
	});

	it.each(ALL_ACTIONS)("can $area.$action in every context", ({ area, action }) => {
		const rule = expected(role, area, action);
		for (const ctx of CONTEXTS) {
			expect(can(role, area, action, ctx), JSON.stringify(ctx)).toBe(expectedCan(role, rule, ctx));
		}
	});
});

// ─── Invariants ─────────────────────────────────────────────────────────────

describe("invariants", () => {
	const pairs = ORG_ROLES.flatMap((higher) =>
		ORG_ROLES.filter((lower) => hasRoleOrHigher(higher, lower) && higher !== lower).map(
			(lower) => [higher, lower] as const,
		),
	);

	it.each(pairs)("%s can do everything %s can, in every context", (higher, lower) => {
		for (const { area, action } of ALL_ACTIONS) {
			for (const ctx of CONTEXTS) {
				if (can(lower, area, action, ctx)) {
					expect(can(higher, area, action, ctx), `${area}.${action} ${JSON.stringify(ctx)}`).toBe(
						true,
					);
				}
			}
		}
	});

	it("fails closed: unknown roles can do nothing", () => {
		for (const { area, action } of ALL_ACTIONS) {
			expect(can("GUEST" as Role, area, action, { isOwn: true, hasGrant: true })).toBe(false);
			expect(roleAllows("member" as Role, area, action)).toBe(false);
		}
	});

	it("fails closed: truthy non-true context values do not count", () => {
		const ctx = { isOwn: 1, hasGrant: "yes" } as never;
		expect(can(MEMBER, "marker", "read", ctx)).toBe(false);
		expect(can(REVIEWER, "marker", "update", { hasGrant: true, isOwn: 1 } as never)).toBe(false);
	});

	it("non-org-wide roles never act on a target without a grant, except `free` rules", () => {
		for (const role of ORG_ROLES.filter((r) => !isOrgWide(r))) {
			for (const { area, action } of ALL_ACTIONS) {
				if (expected(role, area, action) === "free") continue;
				expect(can(role, area, action, { isOwn: true }), `${role} ${area}.${action}`).toBe(false);
			}
		}
	});

	it("only the owner can rename or delete the organization", () => {
		for (const role of ORG_ROLES) {
			expect(can(role, "organization", "rename")).toBe(role === OWNER);
			expect(can(role, "organization", "delete")).toBe(role === OWNER);
		}
	});
});

// ─── Role helpers ───────────────────────────────────────────────────────────

describe("ORG_ROLES / INVITE_ROLES / MANAGER_ROLES", () => {
	it("lists roles highest first", () => {
		expect(ORG_ROLES).toEqual([OWNER, ADMIN, MEMBER, REVIEWER]);
	});

	it("never offers OWNER for invitations", () => {
		expect(INVITE_ROLES).toEqual([ADMIN, MEMBER, REVIEWER]);
	});

	it("managers are owner and admin, and they are the org-wide roles", () => {
		expect(MANAGER_ROLES).toEqual([OWNER, ADMIN]);
		expect(ORG_ROLES.filter(isOrgWide)).toEqual([OWNER, ADMIN]);
	});
});

describe("hasRoleOrHigher", () => {
	it.each([
		[OWNER, OWNER, true],
		[OWNER, REVIEWER, true],
		[ADMIN, OWNER, false],
		[ADMIN, ADMIN, true],
		[MEMBER, ADMIN, false],
		[MEMBER, REVIEWER, true],
		[REVIEWER, MEMBER, false],
		[REVIEWER, REVIEWER, true],
	])("%s >= %s → %s", (test, against, result) => {
		expect(hasRoleOrHigher(test, against)).toBe(result);
	});

	it("unknown roles never pass, on either side", () => {
		expect(hasRoleOrHigher("x" as Role, REVIEWER)).toBe(false);
		expect(hasRoleOrHigher(OWNER, "x" as Role)).toBe(false);
		expect(hasRoleOrHigher("x" as Role, "x" as Role)).toBe(false);
	});
});

describe("ROLE_LABELS / roleLabel", () => {
	it("has a label for every role", () => {
		for (const role of Object.values(Role)) expect(ROLE_LABELS[role]).toBeTruthy();
	});

	it.each([
		[OWNER, "Owner"],
		[REVIEWER, "Reviewer"],
		["member", "member"],
		["something", "something"],
		["", "Unknown"],
		[null, "Unknown"],
		[undefined, "Unknown"],
	])("roleLabel(%j) → %j", (input, label) => {
		expect(roleLabel(input)).toBe(label);
	});

	it("does not resolve Object.prototype keys as labels", () => {
		expect(roleLabel("toString")).toBe("toString");
	});
});

describe("toRole", () => {
	it.each(Object.values(Role))("accepts %s", (role) => {
		expect(toRole(role)).toBe(role);
	});

	it.each(["member", "owner", "Admin", "", "GUEST", null, undefined])("rejects %j", (value) => {
		expect(toRole(value)).toBeNull();
	});
});

// ─── Member management ──────────────────────────────────────────────────────

describe("canInviteAs", () => {
	it.each([
		[OWNER, ADMIN, true],
		[OWNER, REVIEWER, true],
		[ADMIN, ADMIN, true],
		[ADMIN, MEMBER, true],
		[MEMBER, MEMBER, true],
		[MEMBER, REVIEWER, true],
		[MEMBER, ADMIN, false],
		[REVIEWER, REVIEWER, true],
		[REVIEWER, MEMBER, false],
	])("%s may invite as %s → %s", (actor, role, result) => {
		expect(canInviteAs(actor, role)).toBe(result);
	});

	it.each(ORG_ROLES)("%s may never invite as OWNER", (actor) => {
		expect(canInviteAs(actor, OWNER)).toBe(false);
	});
});

describe("canChangeRole", () => {
	it.each([MEMBER, REVIEWER])("%s may change nobody's role", (actor) => {
		for (const target of ORG_ROLES) {
			for (const next of ORG_ROLES) {
				expect(canChangeRole(actor, target, next, 2)).toBe(false);
			}
		}
	});

	it("admin may change roles up to admin, but never touch or create owners", () => {
		expect(canChangeRole(ADMIN, REVIEWER, MEMBER, 1)).toBe(true);
		expect(canChangeRole(ADMIN, MEMBER, ADMIN, 1)).toBe(true);
		expect(canChangeRole(ADMIN, ADMIN, REVIEWER, 1)).toBe(true);
		expect(canChangeRole(ADMIN, MEMBER, OWNER, 1)).toBe(false);
		expect(canChangeRole(ADMIN, OWNER, ADMIN, 2)).toBe(false);
	});

	it("owner may promote to owner and demote other owners", () => {
		expect(canChangeRole(OWNER, ADMIN, OWNER, 1)).toBe(true);
		expect(canChangeRole(OWNER, OWNER, ADMIN, 2)).toBe(true);
	});

	it("the last owner cannot be demoted", () => {
		for (const next of [ADMIN, MEMBER, REVIEWER]) {
			expect(canChangeRole(OWNER, OWNER, next, 1)).toBe(false);
			expect(canChangeRole(OWNER, OWNER, next, 0)).toBe(false);
		}
	});

	it("setting an owner to owner again is not a demotion", () => {
		expect(canChangeRole(OWNER, OWNER, OWNER, 1)).toBe(true);
	});
});

describe("canRemoveMember", () => {
	it.each([MEMBER, REVIEWER])("%s may remove nobody", (actor) => {
		for (const target of ORG_ROLES) expect(canRemoveMember(actor, target, 2)).toBe(false);
	});

	it("admin may remove up to admin, never an owner", () => {
		expect(canRemoveMember(ADMIN, REVIEWER, 1)).toBe(true);
		expect(canRemoveMember(ADMIN, MEMBER, 1)).toBe(true);
		expect(canRemoveMember(ADMIN, ADMIN, 1)).toBe(true);
		expect(canRemoveMember(ADMIN, OWNER, 3)).toBe(false);
	});

	it("owner may remove an owner unless it is the last one", () => {
		expect(canRemoveMember(OWNER, OWNER, 2)).toBe(true);
		expect(canRemoveMember(OWNER, OWNER, 1)).toBe(false);
		expect(canRemoveMember(OWNER, REVIEWER, 1)).toBe(true);
	});
});

describe("canLeave", () => {
	it.each([ADMIN, MEMBER, REVIEWER])("%s may always leave", (role) => {
		expect(canLeave(role, 0)).toBe(true);
		expect(canLeave(role, 1)).toBe(true);
	});

	it("an owner may leave only if another owner remains", () => {
		expect(canLeave(OWNER, 1)).toBe(false);
		expect(canLeave(OWNER, 2)).toBe(true);
	});
});
