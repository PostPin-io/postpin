import { createAuthClient } from "better-auth/svelte";
import { organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "./roles";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [organizationClient({ ac, roles }), deviceAuthorizationClient()],
});
