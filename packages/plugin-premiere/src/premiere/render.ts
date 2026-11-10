import type { Sequence } from "@adobe/premierepro";
import type { RenderProgress } from "@postpin-io/plugin-core/bridge";
import { settingsStore } from "../bridges/settings";
import { isMac, os, ppro, sep, uxp } from "../host";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function presetPath() {
	const folder = await uxp.storage.localFileSystem.getPluginFolder();
	return `${folder.nativePath.replace(/[\\/]$/, "")}${sep}presets${sep}postpin-preview.epr`;
}

// Media Encoder can't write into UXP's data folder, so renders go to the user's movies folder
async function outputFolder(): Promise<string> {
	const movies = `${os.homedir()}${sep}${isMac ? "Movies" : "Videos"}`;
	const parent = await uxp.storage.localFileSystem.getEntryWithUrl(`file:${movies}`);
	try {
		return (await parent.getEntry("PostPin")).nativePath;
	} catch {
		return (await parent.createFolder("PostPin")).nativePath;
	}
}

// Encoder events only fire for Media Encoder jobs, and their jobID isn't unique,
// so there is one job at a time and the listeners forward to it
interface Job {
	onQueued(): void;
	onProgress(fraction: number): void;
	onDone(error?: Error): void;
}
let job: Job | null = null;
let listening = false;

function listen(encoder: ReturnType<typeof ppro.EncoderManager.getManager>) {
	if (listening) return;
	listening = true;
	const on = (event: string, handler: (e: any) => void) =>
		ppro.EventManager.addEventListener(encoder, event, handler);
	const E = ppro.EncoderManager;
	on(E.EVENT_RENDER_QUEUE, () => job?.onQueued());
	on(E.EVENT_RENDER_PROGRESS, (e) => job?.onProgress(e?.progressAmount ?? 0));
	on(E.EVENT_RENDER_COMPLETE, () => job?.onDone());
	on(E.EVENT_RENDER_ERROR, (e) =>
		job?.onDone(new Error(`Media Encoder failed (error ${e?.inErrorNumber ?? "unknown"})`)),
	);
	on(E.EVENT_RENDER_CANCEL, () =>
		job?.onDone(new Error("Rendering was canceled in Media Encoder")),
	);
}

async function renderWithMediaEncoder(
	sequence: Sequence,
	outPath: string,
	preset: string,
	onProgress: (progress: RenderProgress) => void,
) {
	const encoder = ppro.EncoderManager.getManager();
	listen(encoder);
	await encoder.launchEncoder();

	const start = Date.now();
	let markQueued = () => {};
	const queued = new Promise<void>((resolve) => (markQueued = resolve));
	const finished = new Promise<void>((resolve, reject) => {
		job = {
			onQueued: markQueued,
			onProgress: (fraction) => {
				const elapsed = Date.now() - start;
				onProgress({
					percent: fraction * 100,
					estimatedTimeRemainingMs: fraction > 0 ? (elapsed * (1 - fraction)) / fraction : 0,
				});
			},
			onDone: (error) => (error ? reject(error) : resolve()),
		};
	});
	// rejects before it's awaited when queueing fails
	finished.catch(() => {});

	try {
		const ok = await encoder.exportSequence(
			sequence,
			ppro.Constants.ExportType.QUEUE_TO_AME,
			outPath,
			preset,
		);
		if (!ok) throw new Error("Premiere Pro couldn't queue the export in Media Encoder");
		await Promise.race([queued, sleep(30_000)]);
		// Media Encoder ignores startBatchEncode right after the job arrives
		await sleep(1000);
		if (!(await encoder.startBatchEncode()))
			throw new Error("Media Encoder didn't start the queue");
		await finished;
	} finally {
		job = null;
	}
}

let rendering = false;

export async function renderPreview(
	sequence: Sequence,
	onProgress: (progress: RenderProgress) => void,
): Promise<string> {
	if (rendering) throw new Error("Premiere Pro is already rendering");
	rendering = true;
	try {
		const encoder = ppro.EncoderManager.getManager();
		const { useMediaEncoder } = await settingsStore.read();
		const outPath = `${await outputFolder()}${sep}postpin-preview-${Date.now()}.mp4`;
		const preset = await presetPath();

		onProgress({ percent: 0, estimatedTimeRemainingMs: 0 });
		if (useMediaEncoder && encoder.isAMEInstalled) {
			await renderWithMediaEncoder(sequence, outPath, preset, onProgress);
		} else {
			// no progress events: the promise resolves when the file is done
			const ok = await encoder.exportSequence(
				sequence,
				ppro.Constants.ExportType.IMMEDIATELY,
				outPath,
				preset,
			);
			if (!ok) throw new Error("Premiere Pro couldn't export the sequence");
		}
		onProgress({ percent: 100, estimatedTimeRemainingMs: 0 });
		return outPath;
	} finally {
		rendering = false;
	}
}
