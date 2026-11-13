import * as v from "valibot";

/**
 * Picture changes the scene detection of a web upload found: [frame, score] pairs, frame counted
 * from the first frame of the file (not the start timecode), score between 0 and 1. Only scores of
 * at least SCENE_SCORE_FLOOR are kept, so the cuts of every sensitivity can be built from them.
 */
export const sceneScores = v.object({
	scores: v.array(v.tuple([v.number(), v.number()])),
});

export type SceneScores = v.InferOutput<typeof sceneScores>;
