import { defineEnvVars } from "@sveltejs/kit/env";
import {
	databaseEnvVars,
	envBoolean,
	envNumber,
	redisEnvVars,
	s3EnvVars,
} from "@postpin-io/shared/env";
import * as v from "valibot";

export const variables = defineEnvVars({
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
	...databaseEnvVars,
	...s3EnvVars,
	...redisEnvVars,
});
