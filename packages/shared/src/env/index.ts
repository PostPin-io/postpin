import * as v from "valibot";

/** `"true"` / `"false"`, defaulting to `false` when unset. */
export const envBoolean = v.optional(
	v.pipe(
		v.picklist(["true", "false"]),
		v.transform((value) => value === "true"),
	),
	"false",
);

export const envNumber = v.pipe(v.string(), v.toNumber());

export const s3EnvVars = {
	// unset or empty = AWS S3, otherwise an S3-compatible server like rustfs
	S3_ENDPOINT: {
		schema: v.pipe(
			v.optional(v.string()),
			v.transform((value) => value || undefined),
			v.optional(v.pipe(v.string(), v.url())),
		),
	},
	S3_FORCE_PATH_STYLE: { schema: envBoolean },
	S3_ACCESS_KEY: { schema: v.string() },
	S3_SECRET_KEY: { schema: v.string() },
	S3_BUCKET: { schema: v.string() },
	S3_REGION: { schema: v.string() },
};

export const databaseEnvVars = {
	DATABASE_URL: { schema: v.string() },
};

export const redisEnvVars = {
	REDIS_HOST: { schema: v.string() },
	REDIS_PORT: { schema: envNumber },
	REDIS_USE_SSL: { schema: envBoolean },
};

export type EnvVars = Record<string, { schema: v.GenericSchema<string | undefined, unknown> }>;
export type ParsedEnv<T extends EnvVars> = { [K in keyof T]: v.InferOutput<T[K]["schema"]> };

export type S3Env = ParsedEnv<typeof s3EnvVars>;
export type RedisEnv = ParsedEnv<typeof redisEnvVars>;
export type DatabaseEnv = ParsedEnv<typeof databaseEnvVars>;

/** Parses `vars` from `source` (e.g. `process.env`). For SvelteKit, spread the vars into `defineEnvVars` instead. */
export function parseEnv<T extends EnvVars>(
	vars: T,
	source: Record<string, string | undefined>,
): ParsedEnv<T> {
	const issues: string[] = [];
	const result: Record<string, unknown> = {};
	for (const [key, { schema }] of Object.entries(vars)) {
		const parsed = v.safeParse(schema, source[key]);
		if (parsed.success) result[key] = parsed.output;
		else issues.push(`${key}: ${parsed.issues.map((issue) => issue.message).join(", ")}`);
	}
	if (issues.length > 0) {
		throw new Error(`Invalid environment variables:\n  ${issues.join("\n  ")}`);
	}
	return result as ParsedEnv<T>;
}
