<script lang="ts">
	import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
	import { clampToTimeline, frameFromInput } from "./timecode-input.ts";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import Clock from "@lucide/svelte/icons/clock";
	import { timecodeFormat } from "./timecode-format.svelte.ts";

	interface Props {
		/** Absolute timeline frame */
		frame: number;
		frameRate: FrameRate;
		/** Timeline start, for the frame index shown next to the timecode */
		startFrame: number;
		/** Timeline length in frames; typed values are capped to the timeline */
		frameCount: number;
		/** Click to type a new value; otherwise the value is only shown */
		editable?: boolean;
		mobile?: boolean;
		mobileLandscape?: boolean;
		/** `data-guide` of the field, for a tour step that has the user type into it */
		guide?: string;
	}

	let {
		frame = $bindable(),
		frameRate,
		startFrame,
		frameCount,
		editable = false,
		mobile = false,
		mobileLandscape = false,
		guide,
	}: Props = $props();

	let editingField: "editing_TC" | "editingFrame" | null = $state(null);

	const FRAME_MAX_LENGTH = 7;

	// What's currently typed in the frame field; null while showing the real value
	let frameDraft: string | null = $state(null);

	let inputField_TC: HTMLInputElement | null = $state(null);
	let inputField_Frame: HTMLInputElement | null = $state(null);
	// Unique per instance: in fullscreen a second menu bar, and so a second Timecode, is rendered
	const inputId = $props.id();
	let mobileDialog: HTMLDialogElement | null = $state(null);
	let mobileInput = $state("");
	let mobileError = $state(false);
	// Shared, so every timecode in the app switches together
	const isTC = $derived(timecodeFormat.mode === "tc");

	function openMobileInput() {
		mobileInput = String(frame - startFrame);
		mobileError = false;
		mobileDialog?.showModal();
	}

	function submitMobileInput(event: SubmitEvent) {
		event.preventDefault();
		try {
			const input = mobileInput.trim();
			const targetFrame = /^\d+$/.test(input)
				? frameFromInput(input, startFrame)
				: parseTimecode(input, frameRate);
			frame = clampToTimeline(targetFrame, startFrame, frameCount);
			mobileError = false;
			mobileDialog?.close();
		} catch {
			mobileError = true;
		}
	}

	$effect(() => {
		if (editingField == "editing_TC") {
			inputField_TC?.focus();
			inputField_TC?.select();
		}
	});
	$effect(() => {
		if (editingField == "editingFrame") {
			inputField_Frame?.focus();
			inputField_Frame?.select();
		}
	});

	function setTimecodeValue(input: string) {
		try {
			const parsed = parseTimecode(input, frameRate);
			commit(parsed);
		} catch {
			error = true;
			inputField_TC?.focus();
			inputField_TC?.select();
		}
	}

	function setFrameValue(input: string) {
		try {
			commit(frameFromInput(input, startFrame));
		} catch {
			error = true;
			inputField_Frame?.focus();
			inputField_Frame?.select();
		}
	}

	function commit(target: number | null) {
		const next = target == null ? frame : clampToTimeline(target, startFrame, frameCount);
		if (next !== frame) frame = next;
		// Unchanged or clamped back: the field still holds what was typed
		stopEditing();
	}

	/** Leaves the field and shows the real value again */
	function stopEditing() {
		const field = inputField_TC ?? inputField_Frame;
		editingField = null;
		frameDraft = null;
		error = false;
		if (inputField_TC) inputField_TC.value = formatTimecode(frame, frameRate);
		if (inputField_Frame) inputField_Frame.value = String(frame - startFrame);
		field?.blur();
	}

	// Leaving the field saves a valid value and drops an invalid one, so focus is never trapped
	function commitOnBlur(field: "editing_TC" | "editingFrame", input: string) {
		if (editingField !== field) return;
		try {
			commit(
				field === "editing_TC"
					? parseTimecode(input, frameRate)
					: frameFromInput(input, startFrame),
			);
		} catch {
			stopEditing();
		}
	}

	function handleKey(e: KeyboardEvent, set: (input: string) => void) {
		error = false;
		if (e.key === "Enter") {
			set((e.currentTarget as HTMLInputElement).value);
		} else if (e.key === "Escape") {
			// Don't let Escape also clear the marker selection
			e.stopPropagation();
			stopEditing();
		}
	}

	let error = $state(false);

	// An outside frame change replaces whatever was being typed
	$effect(() => {
		void frame;
		editingField = null;
		frameDraft = null;
		error = false;
	});
</script>

<div class="flex gap-1 font-mono">
	{#if mobile}
		<button
			class="btn btn-ghost btn-md {mobileLandscape ? '' : 'btn-square'}"
			title="Enter frames or timecode"
			aria-label="Jump to time"
			onclick={openMobileInput}
		>
			{#if mobileLandscape}
				{formatTimecode(frame, frameRate)}
			{:else}
				<Clock size={22} />
			{/if}
		</button>
	{:else if isTC}
		<span>
			<button
				type="button"
				title="Click to switch to frames"
				class="cursor-pointer"
				onclick={() => timecodeFormat.toggle()}>TC</button
			></span
		>
		<input
			type="text"
			bind:this={inputField_TC}
			data-guide={guide}
			readonly={editingField !== "editing_TC"}
			value={formatTimecode(frame, frameRate)}
			class="box-content w-[11ch] border-0 bg-transparent px-1 py-0 outline-none [font:inherit]
                       {editingField == 'editing_TC' || error
				? 'rounded-sm ring-1'
				: editable
					? 'cursor-pointer'
					: 'cursor-default'} {error ? 'ring-red-500' : 'ring-primary'}"
			tabindex={editable ? 0 : -1}
			onclick={() => {
				if (editable) editingField = "editing_TC";
			}}
			onblur={(e) => commitOnBlur("editing_TC", e.currentTarget.value)}
			onkeydown={(e) => handleKey(e, setTimecodeValue)}
		/>
	{:else}
		<span>
			<button
				type="button"
				title="Click to switch to timecode"
				class="cursor-pointer"
				onclick={() => timecodeFormat.toggle()}
				>F
			</button></span
		>
		<input
			type="text"
			bind:this={inputField_Frame}
			data-guide={guide}
			readonly={editingField !== "editingFrame"}
			value={frameDraft ?? String(frame - startFrame)}
			maxlength={FRAME_MAX_LENGTH}
			style:width="{Math.max(1, frameDraft?.length ?? String(frame - startFrame).length)}ch"
			oninput={(e) => {
				frameDraft = e.currentTarget.value;
			}}
			class="box-content border-0 bg-transparent px-1 py-0 outline-none [font:inherit]
                       {editingField == 'editingFrame' || error
				? 'rounded-sm ring-1'
				: editable
					? 'cursor-pointer'
					: 'cursor-default'} {error ? 'ring-red-500' : 'ring-primary'}"
			tabindex={editable ? 0 : -1}
			onclick={() => {
				if (editable) editingField = "editingFrame";
			}}
			onblur={(e) => commitOnBlur("editingFrame", e.currentTarget.value)}
			onkeydown={(e) => handleKey(e, setFrameValue)}
		/>
	{/if}
</div>

{#if mobile}
	<dialog bind:this={mobileDialog} class="modal modal-bottom">
		<form method="dialog" class="modal-box flex flex-col gap-3" onsubmit={submitMobileInput}>
			<h2 class="text-lg font-semibold">Jump to time</h2>
			<label class="text-sm" for={inputId}>Enter frames or timecode</label>
			<input
				id={inputId}
				type="text"
				bind:value={mobileInput}
				placeholder="Frames or HH:MM:SS:FF"
				class="input w-full font-mono {mobileError ? 'input-error' : ''}"
				aria-invalid={mobileError}
			/>
			{#if mobileError}
				<p class="text-sm text-error">Enter a valid frame number or timecode.</p>
			{/if}
			<div class="modal-action">
				<button type="button" class="btn" onclick={() => mobileDialog?.close()}>Cancel</button>
				<button type="submit" class="btn btn-primary">Go</button>
			</div>
		</form>
		<form method="dialog" class="modal-backdrop"><button>close</button></form>
	</dialog>
{/if}
