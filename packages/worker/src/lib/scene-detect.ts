import { SCENE_SCORE_FLOOR } from "@postpin-io/shared/logic/web-upload";
import type { SceneScores } from "@postpin-io/shared/types/SceneScores";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

/**
 * ffmpeg arguments that print a scene score for every frame that differs from the one before by at
 * least SCENE_SCORE_FLOOR. Scaled down first: the score barely changes, the decoding gets much faster.
 */
export function sceneDetectArgs(input: string): string[] {
	return [
		"-nostdin",
		"-i",
		input,
		"-an",
		"-sn",
		"-dn",
		"-vf",
		`scale=320:-2,select='gte(scene,${SCENE_SCORE_FLOOR})',metadata=print:file=-`,
		"-f",
		"null",
		"-",
	];
}

/**
 * Reads what `metadata=print` writes: a "frame:… pts:… pts_time:…" line per selected frame,
 * followed by its "lavfi.scene_score=…". The frame counter there only counts selected frames,
 * so the frame number comes from the time.
 */
export function parseSceneScores(output: string, frameRate: FrameRate): SceneScores["scores"] {
	const fps = frameRate.fpsNumerator / frameRate.fpsDenominator;
	const scores: SceneScores["scores"] = [];
	let time: number | null = null;
	for (const line of output.split("\n")) {
		const frame = /pts_time:(-?[\d.]+)/.exec(line);
		if (frame) {
			time = Number(frame[1]);
			continue;
		}
		const score = /lavfi\.scene_score=([\d.]+)/.exec(line);
		if (score && time !== null) {
			const value = Number(score[1]);
			if (value >= SCENE_SCORE_FLOOR && time >= 0) {
				scores.push([Math.round(time * fps), Math.round(value * 1000) / 1000]);
			}
			time = null;
		}
	}
	return scores;
}
