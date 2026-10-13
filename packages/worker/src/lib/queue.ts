import { Queues } from "@postpin/shared/queue";
import { transcode } from "../handlers/transcode.ts";
import type { JobHandlers } from "./worker.ts";
import { probe } from "../handlers/probe.ts";
import { thumbnail } from "../handlers/thumbnail.ts";
import { setVideoProcessingDone } from "../handlers/setVideoProcessingDone.ts";

export const heavyHandlers: JobHandlers<typeof Queues.heavy> = {
	transcode,
};

export const lightHandlers: JobHandlers<typeof Queues.light> = {
	thumbnail,
	probe,
	setVideoProcessingDone,
};
