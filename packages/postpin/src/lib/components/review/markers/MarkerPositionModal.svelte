<script lang="ts">
	import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
	import { clampToTimeline, frameFromInput } from "../timecode-input.ts";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

	interface Props {
		/** Playhead, offered as the new position */
		currentFrame: number;
		startFrame: number;
		frameRate: FrameRate;
		/** Timeline length in frames; the position is capped to the timeline */
		frameCount: number;
		onsave: (frame: number) => void;
	}
	let { currentFrame, startFrame, frameRate, frameCount, onsave }: Props = $props();

	const inputId = $props.id();
	let dialog: HTMLDialogElement | null = $state(null);
	let input = $state("");
	let invalid = $state(false);

	/** Opens with the marker's current position filled in */
	export function open(frame: number) {
		input = formatTimecode(frame, frameRate);
		invalid = false;
		dialog?.showModal();
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		try {
			const value = input.trim();
			// Like "Jump to time": digits are a frame number, anything else a timecode
			const frame = /^\d+$/.test(value)
				? frameFromInput(value, startFrame)
				: parseTimecode(value, frameRate);
			onsave(clampToTimeline(frame, startFrame, frameCount));
			dialog?.close();
		} catch {
			invalid = true;
		}
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom">
	<form class="modal-box flex flex-col gap-3" onsubmit={save}>
		<h2 class="text-lg font-semibold">Marker position</h2>
		<label class="text-sm" for={inputId}>Timecode or frame number</label>
		<input
			id={inputId}
			type="text"
			bind:value={input}
			oninput={() => (invalid = false)}
			placeholder="HH:MM:SS:FF"
			class="input w-full font-mono {invalid ? 'input-error' : ''}"
			aria-invalid={invalid}
		/>
		{#if invalid}
			<p class="text-sm text-error">Enter a valid frame number or timecode.</p>
		{/if}
		<button
			type="button"
			class="btn btn-outline"
			onclick={() => (input = formatTimecode(currentFrame, frameRate))}
		>
			Use playhead ({formatTimecode(currentFrame, frameRate)})
		</button>
		<div class="modal-action">
			<button type="button" class="btn" onclick={() => dialog?.close()}>Cancel</button>
			<button type="submit" class="btn btn-primary">Save</button>
		</div>
	</form>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
