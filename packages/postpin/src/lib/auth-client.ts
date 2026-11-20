import { createAuthClient } from "better-auth/svelte";
import {
	deviceAuthorizationClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { goto } from "$app/navigation";
import { ac, betterAuthRoles } from "./better-auth-roles";

export const authClient = createAuthClient({
	plugins: [
		organizationClient({ ac, roles: betterAuthRoles }),
		deviceAuthorizationClient(),
		twoFactorClient({
			// password was right, the second factor is still missing; keeps ?redirect=
			onTwoFactorRedirect: () => goto(`/auth/two-factor${window.location.search}`),
		}),
		passkeyClient(),
	],
});
