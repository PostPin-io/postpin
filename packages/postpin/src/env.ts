import { defineEnvVars } from "@sveltejs/kit/env";
import { building } from "$app/env";
import {
	databaseEnvVars,
	envBoolean,
	envByteSize,
	envNumber,
	redisEnvVars,
	s3EnvVars,
	type EnvVars,
} from "@postpin-io/shared/env";
import * as v from "valibot";

/**
 * An optional http(s) link shown to visitors, e.g. the imprint. Empty means unset, which hides the
 * link. Only http(s) is allowed because the value ends up in an `href`.
 */
const envLinkUrl = v.pipe(
	v.optional(v.string()),
	v.transform((value) => value?.trim() || undefined),
	v.optional(
		v.pipe(
			v.string(),
			v.url(),
			v.check((url) => /^https?:\/\//i.test(url), "Must start with http:// or https://"),
		),
	),
);

const envOptionalString = v.pipe(
	v.optional(v.string()),
	v.transform((s) => s?.trim() || undefined),
);

/**
 * Makes every variable optional while building, so the Docker build needs no runtime env. At
 * runtime the schemas apply unchanged, which is why the types stay those of the real schemas.
 * Code that runs during the build must not rely on these values (guard it with `building`).
 */
function optionalWhileBuilding<T extends EnvVars>(vars: T): T {
	if (!building) return vars;
	return Object.fromEntries(
		Object.entries(vars).map(([name, config]) => [
			name,
			{ ...config, schema: v.optional(config.schema) },
		]),
	) as unknown as T;
}

export const variables = defineEnvVars(
	optionalWhileBuilding({
		BETTER_AUTH_SECRET: { schema: v.pipe(v.string(), v.minLength(32)) },
		BETTER_AUTH_URL: { schema: v.pipe(v.string(), v.url()) },
		SMTP_HOST: { schema: v.optional(v.string()) },
		SMTP_PORT: { schema: v.optional(envNumber) },
		SMTP_SECURE: { schema: envBoolean },
		SMTP_USER: { schema: v.optional(v.string()) },
		SMTP_PASSWORD: { schema: v.optional(v.string()) },
		SMTP_MAIL_FROM: { schema: v.optional(v.string()) },
		ADMIN_EMAILS: {
			schema: v.pipe(
				v.optional(v.string(), ""),
				v.transform((s) =>
					s
						.split(",")
						.map((e) => e.trim().toLowerCase())
						.filter(Boolean),
				),
			),
		},
		// Shows the landing page on / to visitors who aren't signed in. Off by default, so
		// self-hosted instances go straight to the login.
		LANDING_PAGE: { schema: envBoolean },
		STORAGE_DEFAULT_ORG_QUOTA: { schema: envByteSize }, // empty = unlimited
		STORAGE_DEFAULT_USER_QUOTA: { schema: envByteSize }, // empty = unlimited
		STORAGE_CAPACITY: { schema: envByteSize }, // empty = unlimited
		UPLOAD_MAX_FILE_SIZE: { schema: envByteSize }, // empty = only the quotas limit uploads
		STORAGE_DISK_PATH: {
			schema: v.pipe(
				v.optional(v.string()),
				v.transform((s) => s?.trim() || undefined),
			),
		}, // empty = disabled
		TRANSCODE_MODE: { schema: v.optional(v.picklist(["plugin", "server"]), "plugin") },
		// Most guests one screening link may admit; the presenter picks a number up to this
		SCREENING_MAX_GUESTS: {
			schema: v.pipe(
				v.optional(v.string()),
				v.transform((value) => value?.trim() || "100"),
				v.toNumber(),
				v.integer(),
				v.minValue(1),
				v.maxValue(500), // MAX_GUESTS_PER_LINK
			),
		},
		// Legal links in the footer, on sign-up and on share links. Public: rendered in the browser.
		IMPRINT_URL: { schema: envLinkUrl, public: true },
		PRIVACY_URL: { schema: envLinkUrl, public: true },
		TERMS_URL: { schema: envLinkUrl, public: true },
		DPA_URL: { schema: envLinkUrl, public: true }, // data processing agreement (AVV)

		// Hides email + password on login/signup and blocks those endpoints (SSO-only instances)
		DISABLE_PASSWORD_LOGIN: { schema: envBoolean, public: true },
		GOOGLE_CLIENT_ID: { schema: envOptionalString },
		GOOGLE_CLIENT_SECRET: { schema: envOptionalString },
		MICROSOFT_CLIENT_ID: { schema: envOptionalString },
		MICROSOFT_CLIENT_SECRET: { schema: envOptionalString },
		MICROSOFT_TENANT_ID: { schema: envOptionalString },
		GITHUB_CLIENT_ID: { schema: envOptionalString },
		GITHUB_CLIENT_SECRET: { schema: envOptionalString },
		APPLE_CLIENT_ID: { schema: envOptionalString },
		APPLE_CLIENT_SECRET: { schema: envOptionalString },
		OIDC_DISCOVERY_URL: { schema: envOptionalString },
		OIDC_CLIENT_ID: { schema: envOptionalString },
		OIDC_CLIENT_SECRET: { schema: envOptionalString },
		OIDC_NAME: { schema: envOptionalString },

		...databaseEnvVars,
		...s3EnvVars,
		...redisEnvVars,
	}),
);
