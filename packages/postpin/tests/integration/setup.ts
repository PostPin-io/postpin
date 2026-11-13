import { beforeEach, inject, vi } from "vitest";
import { resetRequestEvent } from "../helpers/request-event.ts";
import { fakes } from "../helpers/fakes.ts";
import { uploadLimits } from "../helpers/upload-limits.ts";

vi.mock("$app/env/private", () => ({
	// tests switch it through fakes.transcodeMode
	get TRANSCODE_MODE() {
		return fakes.transcodeMode;
	},
	DATABASE_URL: inject("databaseUrl"),
	BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
	BETTER_AUTH_URL: "http://localhost:5173",
	SMTP_HOST: "localhost",
	SMTP_PORT: 1025,
	SMTP_SECURE: false,
	SMTP_USER: "",
	SMTP_PASSWORD: "",
	SMTP_MAIL_FROM: "Postpin <noreply@localhost>",
	S3_ENDPOINT: "http://fake-s3.test",
	S3_FORCE_PATH_STYLE: true,
	S3_ACCESS_KEY: "test",
	S3_SECRET_KEY: "test",
	S3_BUCKET: "postpin-test",
	S3_REGION: "eu-west-1",
	REDIS_HOST: "localhost",
	REDIS_PORT: 6389,
	REDIS_USE_SSL: false,
	ADMIN_EMAILS: ["admin@test.local"],
	// quota tests set overrides on the rows; the ENV fallback is unit-tested
	STORAGE_DEFAULT_ORG_QUOTA: undefined,
	STORAGE_DEFAULT_USER_QUOTA: undefined,
	STORAGE_CAPACITY: 1_000_000_000n,
	STORAGE_DISK_PATH: undefined,
	// tests set it with setUploadMaxFileSize()
	get UPLOAD_MAX_FILE_SIZE() {
		return uploadLimits.maxFileSize;
	},
}));

vi.mock("$app/env", () => ({ building: false, dev: true, browser: false, version: "test" }));

vi.mock("$app/server", async () => await import("../helpers/app-server.ts"));

// Only Postgres is real. E-mail, S3 and the queue are recorded in `fakes`.
vi.mock("#lib/server/email.ts", async () => (await import("../helpers/fakes.ts")).fakeEmailModule);
vi.mock("#lib/server/storage.ts", async () => {
	// one fake for both, so tests see S3 calls and presigned URLs in the same place
	const s3Client = (await import("../helpers/fakes.ts")).fakeS3Client();
	return { s3Client, s3PresignClient: s3Client };
});
vi.mock("@postpin-io/shared/queue", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@postpin-io/shared/queue")>();
	const f = await import("../helpers/fakes.ts");
	return { ...actual, getQueue: f.fakeGetQueue, getFlowProducer: f.fakeFlowProducer };
});

beforeEach(async () => {
	resetRequestEvent();
	fakes.reset();
	uploadLimits.maxFileSize = undefined;
	const { truncateAll } = await import("../helpers/db.ts");
	await truncateAll();
});
