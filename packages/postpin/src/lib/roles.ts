import { Role } from "@postpin-io/shared/db/enums";

// ─── Actions ────────────────────────────────────────────────────────────────

/** Every action that exists, per area. Single source of truth for the types below. */
export const ACTIONS = {
	project: ["read", "create", "rename", "delete"],
	timeline: ["read", "create", "rename", "delete", "uploadMetadata"],
	export: ["read", "upload", "rename", "delete"],
	marker: ["read", "create", "update", "delete", "respond"],
	category: ["read", "create", "update", "delete"],
	/** E-mail invitation to the org, a project or a timeline */
	invitation: ["read", "create", "update", "delete"],
	/** Shareable invite link to the org, a project or a timeline */
	inviteLink: ["read", "create", "delete"],
	/** Visitor link, exports only. Visitor rights live on the link, not here. */
	shareLink: ["read", "create", "update", "delete"],
	/** Access to a project or timeline for an existing org member */
	grant: ["create", "delete"],
	member: ["read", "updateRole", "remove"],
	organization: ["rename", "delete", "transferOwnership", "updateSettings"],
} as const;

export type Area = keyof typeof ACTIONS;
export type Action<A extends Area> = (typeof ACTIONS)[A][number];

type Rule = {
	/** Only on resources the user created themselves */
	onlyOwn?: true;
	/** Allowed without a grant on the target (e.g. creating a new top-level project) */
	withoutGrant?: true;
};

type Permissions = { [A in Area]?: { [K in Action<A>]?: Rule } };

// ─── Matrix ─────────────────────────────────────────────────────────────────
// Each role inherits everything from the role below it. An action listed again
// replaces the inherited rule (e.g. Member drops `onlyOwn` on markers).

const all: Rule = {};
const own: Rule = { onlyOwn: true };

const reviewer = {
	project: { read: all },
	timeline: { read: all },
	export: { read: all },
	marker: { read: all, create: all, respond: all, update: own, delete: own },
	category: { read: all, create: all, update: own, delete: own },
	member: { read: all },
} satisfies Permissions;

const member = extend(reviewer, {
	project: { create: { withoutGrant: true }, rename: all, delete: all },
	timeline: { create: all, rename: all, delete: all, uploadMetadata: all },
	export: { upload: all, rename: all, delete: all },
	marker: { update: all, delete: all },
	category: { update: all, delete: all },
	invitation: { read: all, create: all, delete: own, update: own },
	inviteLink: { read: all, create: all, delete: own },
	shareLink: { read: all, create: all, update: own, delete: own },
	grant: { create: all, delete: own },
});

const admin = extend(member, {
	invitation: { delete: all, update: all },
	inviteLink: { delete: all },
	shareLink: { update: all, delete: all },
	grant: { delete: all },
	member: { updateRole: all, remove: all },
	organization: { updateSettings: all },
});

const owner = extend(admin, {
	organization: { rename: all, delete: all, transferOwnership: all },
});

export const roles: Record<Role, Permissions> = {
	[Role.OWNER]: owner,
	[Role.ADMIN]: admin,
	[Role.MEMBER]: member,
	[Role.REVIEWER]: reviewer,
};

function extend(base: Permissions, extra: Permissions): Permissions {
	const merged: Permissions = { ...base };
	for (const area of Object.keys(extra) as Area[]) {
		// new object per area, so `base` is never mutated
		merged[area] = { ...base[area], ...extra[area] } as never;
	}
	return merged;
}

// ─── Roles ──────────────────────────────────────────────────────────────────

const RANK: Record<Role, number> = {
	[Role.REVIEWER]: 0,
	[Role.MEMBER]: 1,
	[Role.ADMIN]: 2,
	[Role.OWNER]: 3,
};

/** Highest first */
export const ORG_ROLES = (Object.keys(RANK) as Role[]).sort((a, b) => RANK[b] - RANK[a]);

export const MANAGER_ROLES: Role[] = [Role.OWNER, Role.ADMIN];
/** These roles act org-wide; all others only below their grants */
const ORG_WIDE_ROLES: Role[] = MANAGER_ROLES;

/** Roles that can be handed out via invitation or invite link */
export type InviteRole = Exclude<Role, typeof Role.OWNER>;
export const INVITE_ROLES = ORG_ROLES.filter((r): r is InviteRole => r !== Role.OWNER);

/** Unknown roles never pass */
export const hasRoleOrHigher = (test: Role, against: Role) =>
	(RANK[test] ?? -1) >= (RANK[against] ?? Number.POSITIVE_INFINITY);

export const isOrgWide = (role: Role) => ORG_WIDE_ROLES.includes(role);

// ─── Checks ─────────────────────────────────────────────────────────────────

export type AccessContext = {
	/** The user created the target resource */
	isOwn?: boolean;
	/** The target lies at or below one of the user's grants (ignored for org-wide roles) */
	hasGrant?: boolean;
};

/** Matrix only: does the role have this action at all? For UI gating, not for authorization. */
export function roleAllows<A extends Area>(role: Role, area: A, action: Action<A>): boolean {
	return getRule(role, area, action) !== undefined;
}

/**
 * Full check. Fails closed: if a rule needs `isOwn` or `hasGrant` and the
 * context does not say `true`, the answer is `false`.
 */
export function can<A extends Area>(
	role: Role,
	area: A,
	action: Action<A>,
	ctx: AccessContext = {},
): boolean {
	const rule = getRule(role, area, action);
	if (!rule) return false;
	if (rule.onlyOwn && ctx.isOwn !== true) return false;
	if (!isOrgWide(role) && !rule.withoutGrant && ctx.hasGrant !== true) return false;
	return true;
}

function getRule<A extends Area>(role: Role, area: A, action: Action<A>): Rule | undefined {
	const rules = roles[role]?.[area] as Partial<Record<Action<A>, Rule>> | undefined;
	return rules?.[action];
}

/** May `actor` hand out `role` via invitation / invite link? Never owner, never above own role. */
export const canInviteAs = (actor: Role, role: Role) =>
	role !== Role.OWNER && hasRoleOrHigher(actor, role);

/**
 * May `actor` change the role of a member who currently has `target` to `next`?
 * `ownerCount` = owners in the org right now (protects the last owner).
 */
export function canChangeRole(actor: Role, target: Role, next: Role, ownerCount: number): boolean {
	if (!roleAllows(actor, "member", "updateRole")) return false;
	if (!hasRoleOrHigher(actor, target) || !hasRoleOrHigher(actor, next)) return false;
	if (target === Role.OWNER && next !== Role.OWNER && ownerCount <= 1) return false;
	return true;
}

/** May `actor` remove a member who has `target` from the org? */
export function canRemoveMember(actor: Role, target: Role, ownerCount: number): boolean {
	if (!roleAllows(actor, "member", "remove")) return false;
	if (!hasRoleOrHigher(actor, target)) return false;
	if (target === Role.OWNER && ownerCount <= 1) return false;
	return true;
}

/** Anyone may leave, except the last owner. */
export const canLeave = (role: Role, ownerCount: number) => role !== Role.OWNER || ownerCount > 1;
