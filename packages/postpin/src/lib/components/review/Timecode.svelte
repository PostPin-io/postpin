<script lang="ts">
	import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
	import { clampToTimeline, frameFromInput } from "./timecode-input.ts";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

	interface Props {
		/** Absolute timeline frame */
		frame: number;
		frameRate: FrameRate;
		/** Timeline start, for the frame index shown next to the timecode */
		startFrame: number;
		/** Timeline length in frames; typed values are capped to the timeline */
		frameCount: number;
		editable?: boolean;
		mobile?: boolean;
		mobileLandscape?: boolean;
	}

	let {
		frame = $bindable(),
		frameRate,
		startFrame,
		frameCount,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		editable,
		mobile = false,
		mobileLandscape = false,
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
	let isTC = $state(true);

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
			if (parsed != null) frame = clampToTimeline(parsed, startFrame, frameCount);
			editingField = null;
			inputField_TC?.blur();
		} catch {
			error = true;
			inputField_TC?.focus();
			inputField_TC?.select();
		}
	}

	function setFrameValue(input: string) {
		try {
			frame = clampToTimeline(frameFromInput(input, startFrame), startFrame, frameCount);
			frameDraft = null;
			editingField = null;
			inputField_Frame?.blur();
		} catch {
			error = true;
			inputField_Frame?.focus();
			inputField_Frame?.select();
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
		<button class="cursor-pointer" title="Enter frames or timecode" onclick={openMobileInput}>
			{#if mobileLandscape}
				{formatTimecode(frame, frameRate)}
			{:else}
				F {frame - startFrame}
			{/if}
		</button>
	{:else if isTC}
		<span>
			<button title="click to switch to Frame" class="cursor-pointer" onclick={() => (isTC = false)}
				>TC</button
			></span
		>
		<input
			type="text"
			bind:this={inputField_TC}
			readonly={editingField !== "editing_TC"}
			value={formatTimecode(frame, frameRate)}
			class="box-content w-[11ch] border-0 bg-transparent px-1 py-0 outline-none [font:inherit]
                       {editingField == 'editing_TC' || error
				? 'rounded-sm ring-1'
				: 'cursor-pointer'} {error ? 'ring-red-500' : 'ring-primary'}"
			onclick={() => {
				editingField = "editing_TC";
			}}
			onblur={() => {
				setTimecodeValue(inputField_TC?.value ?? "");
			}}
			onkeydown={(e) => {
				error = false;
				if (e.key === "Enter" || e.key === "Escape") {
					setTimecodeValue(inputField_TC?.value ?? "");
				}
			}}
		/>
	{:else}
		<span>
			<button title="click to switch to TC" class="cursor-pointer" onclick={() => (isTC = true)}
				>F
			</button></span
		>
		<input
			type="text"
			bind:this={inputField_Frame}
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
				: 'cursor-pointer'} {error ? 'ring-red-500' : 'ring-primary'}"
			onclick={() => {
				editingField = "editingFrame";
			}}
			onblur={() => {
				setFrameValue(inputField_Frame?.value ?? "");
			}}
			onkeydown={(e) => {
				error = false;
				if (e.key === "Enter" || e.key === "Escape") {
					setFrameValue(inputField_Frame?.value ?? "");
				}
			}}
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
