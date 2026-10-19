<script lang="ts">
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import { formatTimecode } from "./timecode";

	interface Props {
		frame: number;
		frameRate: FrameRate;
		startFrame: number;
	}

	let { frame, frameRate, startFrame }: Props = $props();
</script>

<span class="font-mono">
	TC {formatTimecode(frame + startFrame, frameRate)} | #{frame}
</span>
