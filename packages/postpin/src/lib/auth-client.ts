import { createAuthClient } from "better-auth/svelte";
import { organizationClient } from "better-auth/client/plugins";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { ac, betterAuthRoles } from "./better-auth-roles";

export const authClient = createAuthClient({
	plugins: [organizationClient({ ac, roles: betterAuthRoles }), deviceAuthorizationClient()],
});
