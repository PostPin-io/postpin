import { formatTimecode } from "@postpin-io/shared/logic/timecode";
import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

const STORAGE_KEY = "TimecodeFormat";

export type TimecodeMode = "tc" | "frames";

function load(): TimecodeMode {
	if (typeof localStorage === "undefined") return "tc";
	try {
		return localStorage.getItem(STORAGE_KEY) === "frames" ? "frames" : "tc";
	} catch {
		return "tc";
	}
}

// One choice for the whole app: switching it in the marker list also switches the player
class TimecodeFormat {
	mode = $state<TimecodeMode>(load());

	toggle() {
		this.mode = this.mode === "tc" ? "frames" : "tc";
		try {
			localStorage.setItem(STORAGE_KEY, this.mode);
		} catch {
			// private window / storage blocked: the choice just isn't remembered
		}
	}

	/** A position on the timeline, as timecode or as frame index from the timeline start */
	position(frame: number, frameRate: FrameRate, startFrame: number): string {
		return this.mode === "tc" ? formatTimecode(frame, frameRate) : String(frame - startFrame);
	}

	/** A length in frames, as timecode or as frame count */
	length(frames: number, frameRate: FrameRate): string {
		return this.mode === "tc" ? formatTimecode(frames, frameRate) : `${frames} f`;
	}
}

export const timecodeFormat = new TimecodeFormat();
