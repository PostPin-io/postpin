<script lang="ts">
	// The web upload: choose a video, check the values read from it, upload. The upload itself
	// runs in the tab's upload manager, so this closes as soon as it started.
	import ImageUp from "@lucide/svelte/icons/cloud-upload";
	import FileVideoCamera from "@lucide/svelte/icons/file-video-camera";
	import Info from "@lucide/svelte/icons/info";
	import X from "@lucide/svelte/icons/x";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import {
		CUT_LEVEL_LABELS,
		FRAME_RATE_OPTIONS,
		type CutLevel,
		type UserSetField,
	} from "@postpin-io/shared/logic/web-upload";
	import { getUploadLimits } from "./upload.remote.ts";
	import {
		UPLOAD_EXTENSIONS,
		UPLOAD_FORMATS_TEXT,
		inspectFile,
		type Inspection,
	} from "#lib/upload/inspect-file.ts";
	import {
		buildUploadForm,
		defaultExportName,
		formatDuration,
		frameRateByLabel,
		initialValues,
		parseStart,
		sizeProblem,
		timecodeFor,
	} from "#lib/upload/upload-form.ts";
	import { uploads } from "#lib/upload/uploads.svelte.ts";

	interface Props {
		projectId: string;
		timelineId: string;
	}
	let { projectId, timelineId }: Props = $props();

	const LEVELS = ["sensitive", "medium", "insensitive"] as const;

	let dialog: HTMLDialogElement | null = null;
	let fileInput: HTMLInputElement | null = $state(null);
	let isOpen = $state(false);

	let file = $state<File | null>(null);
	let inspection = $state<Inspection | null>(null);
	let inspecting = $state(false);
	let dragging = $state(false);

	let name = $state("");
	let frameRate = $state("");
	let startTimecode = $state("");
	let changed = $state<UserSetField[]>([]);
	let detectCuts = $state(true);
	let cutLevel = $state<Exclude<CutLevel, "none">>("medium");
	let starting = $state(false);
	let submitError = $state<string | null>(null);

	const limitsQuery = $derived(isOpen ? getUploadLimits(timelineId) : undefined);
	const limits = $derived(limitsQuery?.current);

	const isMxf = $derived(inspection?.kind === "later");
	const problem = $derived(
		inspection?.kind === "invalid"
			? inspection.message
			: file
				? sizeProblem(file.size, limits)
				: null,
	);
	const rate = $derived(frameRateByLabel(frameRate));
	const startError = $derived.by(() => {
		if (!startTimecode.trim() || !rate) return null;
		const start = parseStart(startTimecode, rate);
		return "error" in start ? start.error : null;
	});
	const canUpload = $derived(
		!!file &&
			!!inspection &&
			inspection.kind !== "invalid" &&
			!problem &&
			!startError &&
			!!name.trim() &&
			!starting,
	);

	export function open() {
		reset();
		isOpen = true;
		dialog?.showModal();
		// start loading the file reader while the user picks a file
		void import("mediabunny");
	}

	function reset() {
		file = null;
		inspection = null;
		name = "";
		frameRate = "";
		startTimecode = "";
		changed = [];
		detectCuts = true;
		cutLevel = "medium";
		submitError = null;
		if (fileInput) fileInput.value = "";
	}

	async function choose(chosen: File | undefined) {
		if (!chosen) return;
		file = chosen;
		submitError = null;
		changed = [];
		name = defaultExportName(chosen.name);
		inspecting = true;
		inspection = null;
		try {
			const result = await inspectFile(chosen);
			// a newer choice won the race
			if (file !== chosen) return;
			inspection = result;
			({ frameRate, startTimecode } = initialValues(result));
		} finally {
			if (file === chosen) inspecting = false;
		}
	}

	function markChanged(field: UserSetField) {
		if (!changed.includes(field)) changed = [...changed, field];
	}

	function onFrameRateChange() {
		markChanged("frameRate");
		// keep the timecode's separator in line with drop-frame
		if (rate && startTimecode.trim() && !startError) {
			startTimecode = timecodeFor(startTimecode, rate);
		}
	}

	async function submit() {
		if (!file || !inspection || !canUpload) return;
		const form = buildUploadForm({
			fileName: file.name,
			inspection,
			frameRateLabel: frameRate,
			startTimecode,
			changed,
			cutLevel: detectCuts ? cutLevel : "none",
		});
		if ("error" in form) {
			submitError = form.error;
			return;
		}
		starting = true;
		submitError = null;
		try {
			await uploads.start({ file, projectId, timelineId, name: name.trim(), form });
			dialog?.close();
		} catch (e) {
			submitError =
				(e as { body?: { message?: string } })?.body?.message ??
				(e instanceof Error ? e.message : "The upload could not be started");
		} finally {
			starting = false;
		}
	}

	const estimatedBadge = (field: UserSetField) => !isMxf && !changed.includes(field);
</script>

{#snippet estimated(field: UserSetField)}
	{#if estimatedBadge(field)}
		<span class="badge badge-ghost badge-sm" title="Read from the file, please check"
			>estimated</span
		>
	{/if}
{/snippet}

<!-- Phones: a sheet from the bottom that fits the visible viewport -->
<dialog
	class="modal modal-bottom sm:modal-middle"
	bind:this={dialog}
	onclose={() => (isOpen = false)}
>
	<div class="modal-box max-h-[90dvh] pt-0">
		<div class="sticky top-0 z-10 -mx-6 flex items-start gap-2 bg-base-100 px-6 pt-6 pb-2">
			<h3 class="flex-1 text-lg font-bold">Upload a video</h3>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X size={16} />
			</button>
		</div>

		<!-- Like the panel boxes: dashed and faded while empty, solid with a file or while dragging -->
		<button
			type="button"
			class="mt-2 flex w-full flex-col items-center justify-center gap-2 rounded-box border-2 px-4 py-8 text-center transition-colors hover:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
				{file || dragging
				? 'border-base-content/50 bg-base-200/50'
				: 'border-dashed border-base-content/30 text-base-content/50'}"
			onclick={() => fileInput?.click()}
			ondragenter={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragover={(e) => e.preventDefault()}
			ondragleave={() => (dragging = false)}
			ondrop={(e) => {
				e.preventDefault();
				dragging = false;
				void choose(e.dataTransfer?.files[0]);
			}}
		>
			{#if file}
				<FileVideoCamera size={28} />
				<span class="max-w-full truncate font-medium" title={file.name}>{file.name}</span>
				<span class="text-xs text-base-content/60">
					{formatByteSize(file.size)}
					{#if inspection?.kind === "video"}
						· {inspection.codec} · {inspection.width}×{inspection.height} ·
						{formatDuration(inspection.durationSeconds)}
					{/if}
				</span>
				<span class="text-xs text-base-content/50">Click to choose another file</span>
			{:else}
				<ImageUp size={28} />
				<span class="font-medium">
					<span class="max-sm:hidden">Drop a video here or click to choose one</span>
					<span class="sm:hidden">Choose a video</span>
				</span>
			{/if}
		</button>
		<input
			bind:this={fileInput}
			type="file"
			class="hidden"
			accept={[...UPLOAD_EXTENSIONS, "video/*"].join(",")}
			onchange={(e) => void choose(e.currentTarget.files?.[0])}
		/>
		<p class="mt-2 text-xs text-base-content/60">
			{UPLOAD_FORMATS_TEXT}{#if limits?.maxFileSize !== null && limits?.maxFileSize !== undefined},
				up to {formatByteSize(limits.maxFileSize)}{/if}.
		</p>

		{#if inspecting}
			<p class="mt-3 flex items-center gap-2 text-sm text-base-content/70" role="status">
				<span class="loading loading-sm loading-spinner"></span> Reading the file…
			</p>
		{/if}
		{#if problem}
			<div role="alert" class="mt-3 alert text-sm alert-error">{problem}</div>
		{/if}

		{#if file && inspection && inspection.kind !== "invalid" && !problem}
			<div class="mt-4 flex flex-col gap-4">
				<label class="flex flex-col gap-1">
					<span class="label text-sm">Name</span>
					<input
						class="input w-full"
						maxlength="100"
						bind:value={name}
						disabled={starting}
						required
					/>
				</label>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<label class="flex flex-col gap-1">
						<span class="label flex items-center gap-2 text-sm"
							>Frame rate {@render estimated("frameRate")}</span
						>
						<select
							class="select w-full"
							bind:value={frameRate}
							onchange={onFrameRateChange}
							disabled={starting}
						>
							{#if isMxf}
								<option value="">Read after upload</option>
							{/if}
							{#each FRAME_RATE_OPTIONS as option (option.label)}
								<option value={option.label}>{option.label}</option>
							{/each}
						</select>
					</label>

					<label class="flex flex-col gap-1">
						<span class="label flex items-center gap-2 text-sm"
							>Start timecode {@render estimated("startFrameIndex")}</span
						>
						<input
							class="input w-full font-mono tabular-nums"
							class:input-error={!!startError}
							inputmode="numeric"
							placeholder={isMxf ? "Read after upload" : "00:00:00:00"}
							bind:value={startTimecode}
							oninput={() => markChanged("startFrameIndex")}
							disabled={starting}
						/>
						{#if startError}
							<span class="text-xs text-error">{startError}</span>
						{/if}
					</label>
				</div>

				{#if isMxf}
					<p class="flex gap-2 text-xs text-base-content/70">
						<Info size={14} class="mt-0.5 shrink-0" />
						MXF files are read after the upload: frame rate, start timecode and length will be filled
						in then. Set them here only to override what the file says.
					</p>
				{:else if inspection.kind === "video" && inspection.variableFrameRate}
					<div role="alert" class="alert text-sm alert-warning">
						Variable frame rate ({inspection.measuredFps.toFixed(3)} fps on average), please check.
					</div>
				{/if}

				<fieldset class="flex flex-col gap-2 rounded-box border border-base-300 p-3">
					<label class="flex items-center justify-between gap-2">
						<span class="text-sm font-medium">Detect cuts</span>
						<input
							type="checkbox"
							class="toggle toggle-sm"
							bind:checked={detectCuts}
							disabled={starting}
						/>
					</label>
					{#if detectCuts}
						<div class="join w-full" role="radiogroup" aria-label="Sensitivity">
							{#each LEVELS as level (level)}
								<input
									class="btn join-item flex-1 btn-sm"
									type="radio"
									name="cut-level"
									aria-label={CUT_LEVEL_LABELS[level]}
									value={level}
									bind:group={cutLevel}
									disabled={starting}
								/>
							{/each}
						</div>
						<p class="text-xs text-base-content/60">
							The timeline is split into shots where the picture changes. You can change this later
							in the review.
						</p>
					{/if}
				</fieldset>
			</div>
		{/if}

		{#if submitError}
			<div role="alert" class="mt-3 alert text-sm alert-error">{submitError}</div>
		{/if}

		<div class="modal-action">
			<button type="button" class="btn" onclick={() => dialog?.close()} disabled={starting}>
				Cancel
			</button>
			<button type="button" class="btn btn-primary" disabled={!canUpload} onclick={submit}>
				Upload
				{#if starting}<span class="loading loading-spinner"></span>{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
