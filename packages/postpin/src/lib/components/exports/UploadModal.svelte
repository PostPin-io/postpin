<script lang="ts">
	// The web upload: choose a video, check the values read from it, upload. The upload itself
	// runs in the tab's upload manager, so this closes as soon as it started.
	import ImageUp from "@lucide/svelte/icons/cloud-upload";
	import FileText from "@lucide/svelte/icons/file-text";
	import FileVideoCamera from "@lucide/svelte/icons/file-video-camera";
	import ListVideo from "@lucide/svelte/icons/list-video";
	import Info from "@lucide/svelte/icons/info";
	import X from "@lucide/svelte/icons/x";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import {
		CUT_LEVEL_LABELS,
		FRAME_RATE_OPTIONS,
		frameRateLabel,
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
	import { hasVideoClips, type CutList } from "@postpin-io/shared/logic/cut-list";
	import {
		CUT_LIST_ACCEPT,
		CUT_LIST_FILE_MAX_BYTES,
		CUT_LIST_FORMATS,
		checkCutListAt,
		cutListSummaryText,
		readCutListFile,
		readDroppedCutList,
		type CutListRead,
	} from "#lib/upload/cut-list-file.ts";

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

	// The cut list: the tracks and markers of the editing software's timeline, read here from a
	// CMX3600 EDL or an FCPXML, so only they are sent, not the file. Checked again whenever the frame
	// rate changes. Without a rate (MXF) the worker checks it once it read the rate from the file.
	let edlInput: HTMLInputElement | null = $state(null);
	let edlName = $state<string | null>(null);
	let cutList = $state<CutList | null>(null);
	let edlReadError = $state<string | null>(null);
	let edlDragging = $state(false);
	const FORMATS = CUT_LIST_FORMATS;
	const edl = $derived(cutList && rate ? checkCutListAt(cutList, rate) : null);
	const edlProblem = $derived(edlReadError ?? (edl?.ok === false ? edl.error : null));
	/** A usable cut list came with the video: its clips are the cuts, nothing is detected */
	const hasCutList = $derived(!!cutList && hasVideoClips(cutList) && !edlProblem);
	const summaryText = cutListSummaryText;

	function useRead(read: CutListRead | null) {
		cutList = read?.ok ? read.list : null;
		edlReadError = read && !read.ok ? read.error : null;
		edlName = read?.name ?? null;
	}

	async function chooseEdl(chosen: File | undefined) {
		// the name shows "Reading…" until the file is read
		useRead(null);
		edlName = chosen?.name ?? null;
		if (chosen) useRead(await readCutListFile(chosen));
	}

	async function dropEdl(e: DragEvent) {
		e.preventDefault();
		edlDragging = false;
		if (starting) return;
		useRead(await readDroppedCutList(e.dataTransfer));
	}

	function removeEdl() {
		useRead(null);
		if (edlInput) edlInput.value = "";
	}

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
			!edlProblem &&
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
		removeEdl();
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
			cutLevel: detectCuts && !hasCutList ? cutLevel : "none",
		});
		if ("error" in form) {
			submitError = form.error;
			return;
		}
		starting = true;
		submitError = null;
		try {
			await uploads.start({ file, projectId, timelineId, name: name.trim(), form, cutList });
			dialog?.close();
		} catch (e) {
			submitError =
				(e as { body?: { message?: string } })?.body?.message ??
				(e instanceof Error ? e.message : "The upload could not be started");
		} finally {
			starting = false;
		}
	}
</script>

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
						<span class="label flex items-center gap-2 text-sm">Frame rate </span>
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
						<span class="label flex items-center gap-2 text-sm">Start timecode </span>
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
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">
						Import Timeline Data<span class="font-normal text-base-content/60"> (optional)</span>
					</span>
					<!-- Like the video above: dashed and faded while empty, solid with a list or while dragging -->
					<div class="relative">
						<button
							type="button"
							class="flex w-full flex-col items-center justify-center gap-2 rounded-box border-2 px-4 py-6 text-center transition-colors hover:border-base-content/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
								{edlName || edlDragging
								? 'border-base-content/50 bg-base-200/50'
								: 'border-dashed border-base-content/30 text-base-content/50'}"
							disabled={starting}
							onclick={() => edlInput?.click()}
							ondragenter={(e) => {
								e.preventDefault();
								edlDragging = true;
							}}
							ondragover={(e) => e.preventDefault()}
							ondragleave={() => (edlDragging = false)}
							ondrop={(e) => void dropEdl(e)}
						>
							{#if edlName}
								<FileText size={28} />
								<span class="max-w-full truncate font-medium" title={edlName}>{edlName}</span>
								<span class="text-xs text-base-content/60">
									{#if cutList && edl?.ok}
										{FORMATS[cutList.format]} · {summaryText(edl)}
									{:else if cutList && !rate}
										{FORMATS[cutList.format]} · the clips are read once the frame rate is known
									{:else if !edlProblem}
										Reading…
									{/if}
								</span>
								<span class="text-xs text-base-content/50">Click to choose another file</span>
							{:else}
								<ListVideo size={28} />
								<span class="font-medium">
									<span class="max-sm:hidden"
										>Drop an EDL or FCPXML here or click to choose one</span
									>
									<span class="sm:hidden">Choose an EDL or FCPXML</span>
								</span>
							{/if}
						</button>
						{#if edlName}
							<button
								type="button"
								class="btn absolute top-1 right-1 btn-square btn-ghost btn-xs"
								title="Remove the cut list"
								aria-label="Remove the cut list"
								disabled={starting}
								onclick={removeEdl}
							>
								<X size={14} />
							</button>
						{/if}
					</div>
					<input
						bind:this={edlInput}
						type="file"
						class="hidden"
						accept={CUT_LIST_ACCEPT}
						onchange={(e) => void chooseEdl(e.currentTarget.files?.[0])}
					/>
					{#if edlProblem}
						<div role="alert" class="mt-1 alert text-sm alert-error">{edlProblem}</div>
					{:else if edl?.ok}
						<p class="text-xs text-base-content/60">
							{#if edl.videoClips > 0}Its clips are the cuts of the timeline, so none are detected.{/if}
							{#if edl.markers > 0}The markers are added to the export, in a category per color.{/if}
						</p>
						{#if cutList?.frameRate && rate && frameRateLabel(rate) !== frameRateLabel(cutList.frameRate)}
							<p class="text-xs text-warning">
								The timeline runs at {frameRateLabel(cutList.frameRate)} fps, the video at
								{frameRateLabel(rate)} fps: the clips are placed by time.
							</p>
						{/if}
					{:else if !edlName}
						<p class="text-xs text-base-content/60">
							The timeline as a CMX3600 EDL or as FCPXML (also a .fcpxmld bundle), up to
							{formatByteSize(CUT_LIST_FILE_MAX_BYTES)}, for its real tracks and cuts.
						</p>
					{/if}
				</div>

				<!-- with the editing software's timeline there is nothing to detect -->
				{#if !hasCutList}
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
								The timeline is split into shots where the picture changes. You can change this
								later in the review.
							</p>
						{/if}
					</fieldset>
				{/if}
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
