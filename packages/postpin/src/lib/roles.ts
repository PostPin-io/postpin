import { createAccessControl } from "better-auth/plugins/access";
import {
	defaultStatements,
	ownerAc,
	adminAc,
	memberAc,
} from "better-auth/plugins/organization/access";

const statement = {
	...defaultStatements,
	project: ["read", "create", "update", "delete", "upload", "review"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
	owner: ac.newRole({
		...ownerAc.statements,
		project: ["read", "create", "update", "delete", "upload", "review"],
	}),
	admin: ac.newRole({
		...adminAc.statements,
		project: ["read", "create", "update", "delete", "upload", "review"],
	}),
	member: ac.newRole({
		...memberAc.statements,
		project: ["read", "create", "update", "upload", "review"],
	}),
	reviewer: ac.newRole({ ...memberAc.statements, project: ["read", "review"] }),
};

export type OrgRole = keyof typeof roles;
export const ORG_ROLES = Object.keys(roles) as OrgRole[];
export const MANAGER_ROLES: OrgRole[] = ["owner", "admin"];
/** Roles that can be handed out via a shareable invite link */
export type InviteLinkRole = Exclude<OrgRole, "owner">;
export const INVITE_LINK_ROLES = ORG_ROLES.filter((role) => role !== "owner");

/** better-auth stores multiple roles as "admin,member" */
export const parseRoles = (role: string) => role.split(",").map((r) => r.trim()) as OrgRole[];

export const hasRole = (role: string, allowed: OrgRole[]) =>
	parseRoles(role).some((r) => allowed.includes(r));

export function can(
	role: string,
	permissions: Parameters<(typeof roles)["owner"]["authorize"]>[0],
) {
	return parseRoles(role).some((r) => roles[r]?.authorize(permissions).success);
}
