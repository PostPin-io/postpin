<script lang="ts">
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import {
		formatTimecode,
		parseTimecode,
	} from "../../../routes/(root)/projects/[project]/timelines/[timeline]/exports/[export]/timecode";

	interface Props {
		/** Absolute timeline frame */
		frame: number;
		frameRate: FrameRate;
		/** Timeline start, for the frame index shown next to the timecode */
		startFrame: number;
		editable?: boolean;
	}

	let { frame = $bindable(), frameRate, startFrame, editable }: Props = $props();

	let editing = $state(false);
	let inputField: HTMLInputElement | null = $state(null);

	$effect(() => {
		if (editing) {
			inputField?.focus();
			inputField?.select();
		}
	});

	function setTimecodeValue(input: string) {
		try {
			frame = parseTimecode(input, frameRate) ?? frame;
			editing = false;
			inputField?.blur();
		} catch {
			error = true;
			inputField?.focus();
			inputField?.select();
		}
	}

	let error = $state(false);

	// An outside frame change replaces whatever was being typed
	$effect(() => {
		void frame;
		editing = false;
		error = false;
	});
</script>

<div class="flex gap-1 font-mono">
	<span>TC</span>
	<input
		type="text"
		bind:this={inputField}
		readonly={!editing}
		value={formatTimecode(frame, frameRate)}
		class="box-content w-[11ch] border-0 bg-transparent px-1 py-0 outline-none [font:inherit]
                       {editing || error ? 'rounded-sm ring-1' : 'cursor-pointer'} {error
			? 'ring-red-500'
			: 'ring-primary'}"
		onclick={() => (editing = true)}
		onblur={() => {
			setTimecodeValue(inputField?.value ?? "");
		}}
		onkeydown={(e) => {
			error = false;
			if (e.key === "Enter" || e.key === "Escape") {
				setTimecodeValue(inputField?.value ?? "");
			}
		}}
	/>
	<span>| {frame - startFrame}</span>
</div>
