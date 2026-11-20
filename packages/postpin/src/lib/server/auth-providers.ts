import * as env from "$app/env/private";
import type { BetterAuthOptions } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";

export type SignInProvider = {
	id: "google" | "microsoft" | "github" | "apple" | "oidc";
	name: string; // button label
};

/**
 * The generic OIDC provider (Keycloak, Authentik, Entra ID, …), or null when it isn't configured.
 * genericOAuth registers it as one more social provider: sign-in, linking and the callback
 * (/api/auth/callback/oidc) work exactly like Google's.
 */
export function oidcProvider(): GenericOAuthConfig | null {
	if (!env.OIDC_DISCOVERY_URL || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) return null;
	return {
		providerId: "oidc",
		discoveryUrl: env.OIDC_DISCOVERY_URL,
		clientId: env.OIDC_CLIENT_ID,
		clientSecret: env.OIDC_CLIENT_SECRET,
		scopes: ["openid", "email", "profile"],
		pkce: true,
	};
}

/** better-auth's `socialProviders`: only those with both a client id and a secret */
export function socialProviders(): NonNullable<BetterAuthOptions["socialProviders"]> {
	const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};

	if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
		providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
	}
	if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
		providers.microsoft = {
			clientId: env.MICROSOFT_CLIENT_ID,
			clientSecret: env.MICROSOFT_CLIENT_SECRET,
			tenantId: env.MICROSOFT_TENANT_ID ?? "common",
		};
	}
	if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
		providers.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
	}
	if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
		providers.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET };
	}

	return providers;
}

const SOCIAL_NAMES = { google: "Google", microsoft: "Microsoft", github: "GitHub", apple: "Apple" };

/** The buttons on login, signup and in the profile, in the order they're shown */
export function signInProviders(): SignInProvider[] {
	const configured = socialProviders();
	const providers: SignInProvider[] = (["google", "microsoft", "github", "apple"] as const)
		.filter((id) => configured[id])
		.map((id) => ({ id, name: SOCIAL_NAMES[id] }));

	if (oidcProvider()) {
		providers.push({ id: "oidc", name: env.OIDC_NAME || "Single sign-on" });
	}
	return providers;
}
