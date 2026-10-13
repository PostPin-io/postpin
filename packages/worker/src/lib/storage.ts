import { createS3Client, getPresignedUrl } from "@postpin/shared/storage";
import { env } from "./env.ts";

export const s3Client = createS3Client(env);

export function getOriginalUrl(videoId: string) {
	return getPresignedUrl(s3Client, env, { videoId, type: "original" });
}
