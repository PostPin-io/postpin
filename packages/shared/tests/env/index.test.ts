import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
	databaseEnvVars,
	envBoolean,
	envNumber,
	parseEnv,
	redisEnvVars,
	s3EnvVars,
} from "../../src/env/index.ts";

const S3_BASE = {
	S3_ACCESS_KEY: "key",
	S3_SECRET_KEY: "secret",
	S3_BUCKET: "bucket",
	S3_REGION: "eu-central-1",
};

describe("envBoolean", () => {
	it("parses 'true' and 'false'", () => {
		expect(v.parse(envBoolean, "true")).toBe(true);
		expect(v.parse(envBoolean, "false")).toBe(false);
	});

	it("defaults to false when unset", () => {
		expect(v.parse(envBoolean, undefined)).toBe(false);
	});

	it.each(["TRUE", "1", "yes", ""])("rejects %j", (value) => {
		expect(v.safeParse(envBoolean, value).success).toBe(false);
	});
});

describe("envNumber", () => {
	it("parses numeric strings", () => {
		expect(v.parse(envNumber, "6379")).toBe(6379);
		expect(v.parse(envNumber, "1.5")).toBe(1.5);
	});

	it("rejects non-numeric strings and a missing value", () => {
		expect(v.safeParse(envNumber, "abc").success).toBe(false);
		expect(v.safeParse(envNumber, undefined).success).toBe(false);
	});

	it.each(["", "   "])("rejects an empty value %j", (value) => {
		expect(v.safeParse(envNumber, value).success).toBe(false);
	});

	it("accepts single digits and surrounding spaces", () => {
		expect(v.parse(envNumber, "0")).toBe(0);
		expect(v.parse(envNumber, " 5 ")).toBe(5);
	});
});

describe("parseEnv", () => {
	it("parses the redis vars", () => {
		expect(
			parseEnv(redisEnvVars, { REDIS_HOST: "redis", REDIS_PORT: "6380", REDIS_USE_SSL: "true" }),
		).toEqual({ REDIS_HOST: "redis", REDIS_PORT: 6380, REDIS_USE_SSL: true });
	});

	it("only reads the declared vars from the source", () => {
		expect(parseEnv(databaseEnvVars, { DATABASE_URL: "postgres://x", OTHER: "y" })).toEqual({
			DATABASE_URL: "postgres://x",
		});
	});

	it("applies defaults for optional vars", () => {
		expect(parseEnv(s3EnvVars, S3_BASE)).toEqual({
			...S3_BASE,
			S3_ENDPOINT: undefined,
			S3_FORCE_PATH_STYLE: false,
		});
	});

	it("treats an empty S3_ENDPOINT as unset", () => {
		expect(parseEnv(s3EnvVars, { ...S3_BASE, S3_ENDPOINT: "" }).S3_ENDPOINT).toBeUndefined();
	});

	it("keeps a valid S3_ENDPOINT", () => {
		expect(
			parseEnv(s3EnvVars, { ...S3_BASE, S3_ENDPOINT: "http://localhost:9000" }).S3_ENDPOINT,
		).toBe("http://localhost:9000");
	});

	it("rejects an S3_ENDPOINT that isn't a URL", () => {
		expect(() => parseEnv(s3EnvVars, { ...S3_BASE, S3_ENDPOINT: "not a url" })).toThrow(
			/S3_ENDPOINT/,
		);
	});

	it("reports every invalid var in one error", () => {
		let error: Error | undefined;
		try {
			parseEnv(
				{ ...redisEnvVars, ...databaseEnvVars },
				{ REDIS_PORT: "x", REDIS_USE_SSL: "maybe" },
			);
		} catch (e) {
			error = e as Error;
		}
		expect(error?.message).toMatch(/^Invalid environment variables:\n/);
		for (const key of ["REDIS_HOST", "REDIS_PORT", "REDIS_USE_SSL", "DATABASE_URL"]) {
			expect(error?.message).toContain(`  ${key}: `);
		}
	});
});
