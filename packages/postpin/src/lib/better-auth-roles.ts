import { Role } from "@postpin-io/shared/db/enums";
import { createAccessControl } from "better-auth/plugins/access";
import {
	defaultStatements,
	adminAc,
	ownerAc,
	memberAc,
} from "better-auth/plugins/organization/access";

export const ac = createAccessControl(defaultStatements);

export const betterAuthRoles = {
	[Role.OWNER]: ownerAc,
	[Role.ADMIN]: adminAc,
	[Role.MEMBER]: memberAc,
	[Role.REVIEWER]: memberAc,
};
