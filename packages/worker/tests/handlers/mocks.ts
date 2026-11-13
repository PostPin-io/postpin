// Shared stand-ins for the worker's external effects. Test files wire them up with
// vi.mock(path, async () => (await import("./mocks.ts")).<name>).
import type { Readable } from "node:stream";
import { vi } from "vitest";
import { env as testEnv } from "../helpers.ts";

export const prisma = {
	// array form only, like the handlers use it
	$transaction: vi.fn(),
	$disconnect: vi.fn(),
	media: { update: vi.fn(), updateMany: vi.fn() },
	mediaFile: {
		findUniqueOrThrow: vi.fn(),
		findFirstOrThrow: vi.fn(),
		findMany: vi.fn(),
		deleteMany: vi.fn(),
		upsert: vi.fn(),
		update: vi.fn(),
	},
	export: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
	thumbnail: { upsert: vi.fn() },
	session: { deleteMany: vi.fn() },
	deviceCode: { deleteMany: vi.fn() },
	verification: { deleteMany: vi.fn() },
	invitation: { deleteMany: vi.fn() },
};

export const s3Client = { putObject: vi.fn() };

export const database = { prisma };
export const storage = {
	s3Client,
	getOriginalUrl: vi.fn(async (id: string) => `https://s3/${id}/original`),
};
export const env = { env: testEnv };
export const ffmpegLib = { ffmpeg: vi.fn(), ffprobe: vi.fn() };
export const sharedStorage = {
	getPresignedUrl: vi.fn(
		async (_c: unknown, _e: unknown, o: { mediaId: string; type: string; proxyId?: string }) =>
			`https://s3/${o.mediaId}/${o.type}${o.proxyId ? `-${o.proxyId}` : ""}`,
	),
	getS3ObjectPath: (o: {
		mediaId: string;
		type: string;
		proxyId?: string;
		index?: number;
		generation?: string;
	}) =>
		`${o.mediaId}/${o.type}${o.proxyId ? `-${o.proxyId}` : ""}${o.generation ? `-${o.generation}` : ""}${o.index !== undefined ? `-${o.index}` : ""}`,
	deleteShotThumbnails: vi.fn(async () => 0),
	deleteObject: vi.fn(async () => {}),
};

export interface UploadParams {
	Bucket: string;
	Key: string;
	Body: Readable;
	ContentType: string;
}
/** Every lib-storage upload created, with what its body contained */
export const uploads: { params: UploadParams; body?: Buffer }[] = [];
export const uploadDone = vi.fn(async (_key?: string) => {});
export const libStorage = {
	Upload: class {
		entry: (typeof uploads)[number];
		constructor({ params }: { params: UploadParams }) {
			this.entry = { params };
			uploads.push(this.entry);
		}
		async done() {
			const chunks: Buffer[] = [];
			for await (const chunk of this.entry.params.Body) chunks.push(chunk as Buffer);
			this.entry.body = Buffer.concat(chunks);
			return uploadDone(this.entry.params.Key);
		}
	},
};

export function resetMocks() {
	vi.clearAllMocks();
	uploads.length = 0;
	const { $transaction, $disconnect, ...models } = prisma;
	for (const model of Object.values(models)) {
		for (const fn of Object.values(model)) fn.mockReset().mockResolvedValue({});
	}
	$disconnect.mockReset().mockResolvedValue(undefined);
	$transaction
		.mockReset()
		.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
	s3Client.putObject.mockReset().mockResolvedValue({});
	sharedStorage.deleteShotThumbnails.mockReset().mockResolvedValue(0);
	sharedStorage.deleteObject.mockReset().mockResolvedValue(undefined);
	uploadDone.mockReset().mockResolvedValue(undefined);
	ffmpegLib.ffmpeg.mockReset();
	ffmpegLib.ffprobe.mockReset();
}
