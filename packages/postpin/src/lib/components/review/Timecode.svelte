<script lang="ts">
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import { formatTimecode } from "../../../routes/(root)/projects/[project]/timelines/[timeline]/exports/[export]/timecode";

	interface Props {
		/** Absolute timeline frame */
		frame: number;
		frameRate: FrameRate;
		/** Timeline start, for the frame index shown next to the timecode */
		startFrame: number;
	}

	let { frame, frameRate, startFrame }: Props = $props();
</script>

<span class="font-mono">
	TC {formatTimecode(frame, frameRate)} | #{frame - startFrame}
</span>
