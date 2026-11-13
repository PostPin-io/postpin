// checkProxy against real proxies from hlsArgs(), with a real ffprobe. Skipped without ffmpeg.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hlsArgs, selectRenditions } from "@postpin-io/shared/media/hls";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
vi.mock("../../src/lib/storage.ts", async () => (await import("./mocks.ts")).storage);
vi.mock("../../src/lib/env.ts", async () => (await import("./mocks.ts")).env);
vi.mock("@postpin-io/shared/storage", async () => (await import("./mocks.ts")).sharedStorage);

import { checkProxy } from "../../src/handlers/verifyProxies.ts";
import { ffprobe } from "../../src/lib/ffmpeg.ts";
import { sharedStorage } from "./mocks.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.runIf(hasFfmpeg)("checkProxy with real proxies", () => {
	let dir: string;
	const source = () => path.join(dir, "source.mp4");
	const media = (height: number) => path.join(dir, `${height}p.mp4`);

	beforeAll(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		dir = mkdtempSync(path.join(tmpdir(), "verify-proxies-"));
		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=1280x720:rate=25:duration=4",
			"-f",
			"lavfi",
			"-i",
			"sine=duration=4",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-c:a",
			"aac",
			"-shortest",
			source(),
		]);
		const renditions = selectRenditions({ width: 1280, height: 720 });
		const outputs = renditions.map((r) => ({
			media: media(r.height),
			playlist: path.join(dir, `${r.height}p.m3u8`),
		}));
		execFileSync("ffmpeg", [
			"-v",
			"error",
			...hlsArgs({ input: source(), renditions, outputs, hasAudio: true }),
		]);
		// the presigned URLs point at the local files
		sharedStorage.getPresignedUrl.mockImplementation(async (_c, _e, o: { proxyId?: string }) =>
			o.proxyId ? media(Number(o.proxyId)) : source(),
		);
	}, 120_000);
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	/** A row like complete-upload stores it for the file of `height` */
	const row = (height: number, box = { 720: [1280, 720], 480: [854, 480] }[height]!) => ({
		id: String(height),
		width: box[0]!,
		height: box[1]!,
		size: BigInt(statSync(media(height)).size),
		duration: 4,
		audioCodec: "aac",
	});

	it("accepts what hlsArgs encodes", async () => {
		const original = await ffprobe(source());
		expect(await checkProxy("m1", row(720), original)).toEqual([]);
		expect(await checkProxy("m1", row(480), original)).toEqual([]);
	});

	it("rejects a file declared as another rendition, and one with another size", async () => {
		const original = await ffprobe(source());
		// the 720p file claimed as 480p: too large for the box
		const asSmaller = { ...row(720), height: 480, width: 854 };
		expect((await checkProxy("m1", asSmaller, original)).join("\n")).toContain(
			"larger than its 854x480 box",
		);
		expect((await checkProxy("m1", { ...row(480), size: 1n }, original)).join("\n")).toContain(
			"the upload had 1",
		);
		expect(
			(await checkProxy("m1", { ...row(480), audioCodec: null }, original)).join("\n"),
		).toContain("expected none");
	});
});
