import { EventEmitter } from "node:events";
import { PassThrough, Readable } from "node:stream";
import { vi } from "vitest";

/** A stand-in for a spawned child process: emit on stdout/stderr, then call close() */
export class FakeProcess extends EventEmitter {
	stdout = new PassThrough();
	stderr = new EventEmitter();

	writeStdout(data: string | Buffer) {
		this.stdout.write(data);
	}

	writeStderr(text: string) {
		this.stderr.emit("data", Buffer.from(text));
	}

	close(code: number) {
		this.stdout.end();
		this.emit("close", code);
	}
}

/** What the mocked lib/ffmpeg.ts ffmpeg() returns */
export function fakeFfmpegRun(chunks: Buffer[] = [], error?: Error) {
	return {
		stdout: Readable.from(chunks),
		done: error ? Promise.reject(error) : Promise.resolve(),
	};
}

/** A BullMQ job with only the parts handlers use */
export function fakeJob<D>(name: string, data: D, childrenValues: Record<string, unknown> = {}) {
	return {
		id: "job-1",
		name,
		data,
		getChildrenValues: vi.fn(async () => childrenValues),
		updateProgress: vi.fn(async () => {}),
	};
}

export const env = {
	S3_BUCKET: "bucket",
	S3_ACCESS_KEY: "key",
	S3_SECRET_KEY: "secret",
	S3_REGION: "eu",
	S3_ENDPOINT: undefined,
	S3_FORCE_PATH_STYLE: false,
	DATABASE_URL: "postgres://test",
	REDIS_HOST: "redis",
	REDIS_PORT: 6379,
	REDIS_USE_SSL: false,
};
