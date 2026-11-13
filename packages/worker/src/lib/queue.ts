import { Queues } from "@postpin-io/shared/queue";
import { transcode } from "../handlers/transcode.ts";
import type { JobHandlers } from "./worker.ts";
import { probe } from "../handlers/probe.ts";
import { thumbnail } from "../handlers/thumbnail.ts";
import { setMediaProcessingDone } from "../handlers/setMediaProcessingDone.ts";
import { seekSprites } from "../handlers/seekSprites.ts";
import { shotThumbnails } from "../handlers/shotThumbnails.ts";
import { movieBarcode } from "../handlers/movieBarcode.ts";
import { sceneDetect } from "../handlers/sceneDetect.ts";
import { cutList } from "../handlers/cutList.ts";
import { cleanup } from "../handlers/cleanup.ts";

export const heavyHandlers: JobHandlers<typeof Queues.heavy> = {
	transcode,
};

export const lightHandlers: JobHandlers<typeof Queues.light> = {
	thumbnail,
	probe,
	setMediaProcessingDone,
	seekSprites,
	shotThumbnails,
	movieBarcode,
	sceneDetect,
	cutList,
};

export const maintenanceHandlers: JobHandlers<typeof Queues.maintenance> = { cleanup };
