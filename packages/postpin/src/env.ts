import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from "valibot";

const envBoolean = v.pipe(
    v.picklist(["true", "false"]),
    v.transform((value) => value === "true"),
);

export const variables = defineEnvVars({
    DATABASE_URL: { schema: v.string() },
    BETTER_AUTH_SECRET: { schema: v.pipe(v.string(), v.minLength(32)) },
    BETTER_AUTH_URL: { schema: v.pipe(v.string(), v.url()) },
    SMTP_HOST: { schema: v.optional(v.string()) },
    SMTP_PORT: { schema: v.optional(v.pipe(v.string(), v.toNumber())) },
    SMTP_SECURE: { schema: v.optional(envBoolean) },
    SMTP_USER: { schema: v.optional(v.string()) },
    SMTP_PASSWORD: { schema: v.optional(v.string()) },
    SMTP_MAIL_FROM: { schema: v.optional(v.string()) },
});