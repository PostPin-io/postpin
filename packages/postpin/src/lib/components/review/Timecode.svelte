<script lang="ts">
	import { formatTimecode, parseTimecode } from "@postpin-io/shared/logic/timecode";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

	interface Props {
		/** Absolute timeline frame */
		frame: number;
		frameRate: FrameRate;
		/** Timeline start, for the frame index shown next to the timecode */
		startFrame: number;
		editable?: boolean;
	}

	let { frame = $bindable(), frameRate, startFrame, editable }: Props = $props();

	let editingField: "editing_TC" | "editingFrame" | null = $state(null);

	const FRAME_MAX_LENGTH = 7;

	// What's currently typed in the frame field; null while showing the real value
	let frameDraft: string | null = $state(null);

	let inputField_TC: HTMLInputElement | null = $state(null);
	let inputField_Frame: HTMLInputElement | null = $state(null);
	let isTC = $state(true);

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
			frame = parseTimecode(input, frameRate) ?? frame;
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
			frame = parseInt(input) + startFrame;
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
	{#if isTC}
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
