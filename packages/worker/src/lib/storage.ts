import { createS3Client, getPresignedUrl } from "@postpin/shared/storage";
import { env } from "./env.ts";

export const s3Client = createS3Client(env);

export function getOriginalUrl(mediaId: string) {
	return getPresignedUrl(s3Client, env, { mediaId, type: "original" });
}
