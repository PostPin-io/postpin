import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cutFrames } from "@postpin-io/shared/logic/web-upload";
import { parseSceneScores, sceneDetectArgs } from "@postpin-io/shared/media/scene-detect";

const FPS_24 = { fpsNumerator: 24, fpsDenominator: 1, dropFrame: false };
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
// three-cuts.mp4 (rendered by tests/fixtures/generate-fixtures.ts): 8 s at 24 fps, hard cuts at 2 s, 4 s and 6 s. Its ffmpeg output, recorded with
// sceneDetectArgs, is in three-cuts.scenes.txt, so the parser test runs without ffmpeg.
const recorded = readFileSync(fixture("three-cuts.scenes.txt"), "utf8");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("sceneDetectArgs", () => {
	it("scales down, keeps scores of at least 0.1 and prints them to stdout", () => {
		const args = sceneDetectArgs("https://s3/m1/original");
		expect(args).toContain("https://s3/m1/original");
		expect(args).toContain("-an");
		expect(args[args.indexOf("-vf") + 1]).toBe(
			"scale=320:-2,select='gte(scene,0.1)',metadata=print:file=-",
		);
		expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
	});
});

describe("parseSceneScores", () => {
	it("reads the three cuts of the test video, at their frames", () => {
		const scores = parseSceneScores(recorded, FPS_24);
		expect(scores.map(([frame]) => frame)).toEqual([48, 96, 144]);
		for (const [, score] of scores) expect(score).toBeGreaterThan(0.6);
	});

	it("gives all three levels the same three cuts", () => {
		const scores = parseSceneScores(recorded, FPS_24);
		for (const level of ["sensitive", "medium", "insensitive"] as const) {
			expect(cutFrames(scores, level, FPS_24, 192)).toEqual([48, 96, 144]);
		}
	});

	it("converts the time at 23.976 and skips scores below 0.1 and lines it doesn't know", () => {
		const output = [
			"frame:0    pts:1001   pts_time:1.001",
			"lavfi.scene_score=0.420000",
			"some other line",
			"frame:1    pts:2002   pts_time:2.002",
			"lavfi.scene_score=0.050000",
			"lavfi.scene_score=0.9",
			"",
		].join("\n");
		expect(
			parseSceneScores(output, { fpsNumerator: 24000, fpsDenominator: 1001, dropFrame: false }),
		).toEqual([[24, 0.42]]);
	});

	it("nothing for empty output", () => {
		expect(parseSceneScores("", FPS_24)).toEqual([]);
	});

	it.runIf(hasFfmpeg)("matches what ffmpeg finds in the test video right now", () => {
		const args = sceneDetectArgs(fixture("three-cuts.mp4"));
		const output = execFileSync("ffmpeg", ["-v", "error", ...args], { encoding: "utf8" });
		expect(parseSceneScores(output, FPS_24).map(([frame]) => frame)).toEqual([48, 96, 144]);
	});
});
