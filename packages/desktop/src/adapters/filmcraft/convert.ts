// Pure conversions between FilmCraft's control-channel JSON and PostPin's types, no I/O.
// Shapes follow FilmCraft's engine source (crates/engine/src/commands.rs inspect_sequence,
// crates/interchange/src/otio.rs), checked against main in 2026-11.

import type { PaletteColor } from "@postpin-io/plugin-core/bridge";
import { formatTimecode } from "@postpin-io/shared/logic/timecode";
import type {
	Clip,
	FrameRate,
	MediaItem,
	TimelineSnapshot,
	Track,
} from "@postpin-io/shared/types/TimelineSnapshot";

/** FilmCraft time unit: every time is an integer number of ticks */
export const TICKS_PER_SECOND = 254_016_000_000n;

// Label colours from crates/project/src/label.rs, in the order of FilmCraft's Label menu
const LABELS: [string, string][] = [
	["Violet", "#380ea7"],
	["Iris", "#1d4a64"],
	["Caribbean", "#355418"],
	["Lavender", "#6b1c82"],
	["Cerulean", "#23535a"],
	["Forest", "#404a11"],
	["Rose", "#801836"],
	["Mango", "#803f17"],
	["Purple", "#590db0"],
	["Blue", "#192d94"],
	["Teal", "#1f4d45"],
	["Magenta", "#791c56"],
	["Tan", "#6c5b47"],
	["Green", "#295c2d"],
	["Brown", "#583d14"],
	["Yellow", "#6e6628"],
];

export const PALETTE: PaletteColor[] = LABELS.map(([id, hex]) => ({ id, hex }));

const hexToRgb = (hex: string) => {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/**
 * A marker colour as FilmCraft reports it (a label name or "#rrggbb" for custom colours) as a
 * palette id. Custom colours get the nearest label.
 */
export function paletteIdOf(color: unknown): string {
	if (typeof color !== "string") return "Green";
	const label = LABELS.find(([name]) => name.toLowerCase() === color.toLowerCase());
	if (label) return label[0];
	if (!/^#[0-9a-f]{6}$/i.test(color)) return "Green";
	const [r, g, b] = hexToRgb(color);
	let best = LABELS[0];
	let bestDistance = Infinity;
	for (const entry of LABELS) {
		const [lr, lg, lb] = hexToRgb(entry[1]);
		const distance = (r - lr) ** 2 + (g - lg) ** 2 + (b - lb) ** 2;
		if (distance < bestDistance) {
			best = entry;
			bestDistance = distance;
		}
	}
	return best[0];
}

export const labelHex = (name: string) =>
	LABELS.find(([label]) => label.toLowerCase() === name.toLowerCase())?.[1] ?? null;

/**
 * The sequence's `settings.frame_rate`. craft-libs serializes FrameRate as {num, den}; arrays and
 * plain fps numbers are accepted too, in case that changes.
 */
export function parseFrameRate(value: unknown, dropFrame: boolean): FrameRate {
	let num: number | undefined;
	let den: number | undefined;
	if (Array.isArray(value)) {
		[num, den] = value;
	} else if (value && typeof value === "object") {
		const rate = value as Record<string, unknown>;
		num = Number(rate.num ?? rate.numerator);
		den = Number(rate.den ?? rate.denominator);
	} else if (typeof value === "number") {
		// 23.976 and friends as NTSC rates, anything else as a whole rate
		const ntsc = Math.round(value * 1.001);
		if (Math.abs(value - ntsc / 1.001) < 1e-3 && Math.abs(value - ntsc) > 1e-3) {
			num = ntsc * 1000;
			den = 1001;
		} else {
			num = Math.round(value);
			den = 1;
		}
	}
	if (!num || !den || !Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
		throw new Error(`FilmCraft reported a frame rate PostPin can't read: ${JSON.stringify(value)}`);
	}
	return { fpsNumerator: num, fpsDenominator: den, dropFrame };
}

/** Frame a tick falls in, like FrameRate::frame_at (BigInt, ticks overflow doubles quickly) */
export function frameAtTick(ticks: number, rate: FrameRate): number {
	const t = BigInt(Math.trunc(ticks));
	const num = BigInt(rate.fpsNumerator);
	const den = BigInt(rate.fpsDenominator) * TICKS_PER_SECOND;
	const product = t * num;
	// floor, also for negative ticks
	const frame = product >= 0n ? product / den : -((-product + den - 1n) / den);
	return Number(frame);
}

// ---------------------------------------------------------------------------------------------
// sequence.inspect
// ---------------------------------------------------------------------------------------------

export interface InspectedMarker {
	id: number;
	start: number;
	duration: number;
	name: string;
	comment: string;
	color: string;
}

export interface InspectedClip {
	clip: number;
	item: number;
	name: string;
	startFrame: number;
	durationFrames: number;
	sourceIn: number;
	speed: number;
	reverse: boolean;
	enabled: boolean;
	label: string;
	customLabelColor: string | null;
}

export interface InspectedTrack {
	id: number;
	name: string;
	enabled: boolean;
	items: InspectedClip[];
}

export interface InspectedSequence {
	id: number;
	name: string | null;
	settings: { frame_rate: unknown; drop_frame: boolean };
	durationFrames: number;
	markers: InspectedMarker[];
	video: InspectedTrack[];
	audio: InspectedTrack[];
}

// ---------------------------------------------------------------------------------------------
// OTIO export (file.exportOtio)
// ---------------------------------------------------------------------------------------------

export interface OtioMedia {
	/** absolute file path */
	filePath: string;
	name: string;
	/** the file's own rate, null when FilmCraft has none (audio files) */
	frameRate: FrameRate | null;
	/** timecode of the file's first frame, in frames at frameRate */
	startFrame: number;
}

export interface OtioInfo {
	/** "Start Time" of the sequence in frames */
	startTimecode: number;
	/** media files by FilmCraft project item id */
	media: Map<number, OtioMedia>;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
	!!value && typeof value === "object" && !Array.isArray(value);

/**
 * Reads what sequence.inspect doesn't have from FilmCraft's OTIO export: the start timecode and
 * the media file of each project item. `resolveUrl` turns a target_url (relative to the export's
 * folder) into an absolute path.
 */
export function readOtio(otio: unknown, resolveUrl: (url: string) => string | null): OtioInfo {
	if (!isObject(otio) || otio.OTIO_SCHEMA !== "Timeline.1") {
		throw new Error("FilmCraft's OTIO export isn't a timeline");
	}
	const meta =
		isObject(otio.metadata) && isObject(otio.metadata.filmcraft) ? otio.metadata.filmcraft : {};
	let startTimecode = Number(meta.start_timecode);
	if (!Number.isInteger(startTimecode)) {
		const start = isObject(otio.global_start_time) ? Number(otio.global_start_time.value) : 0;
		startTimecode = Number.isFinite(start) ? Math.round(start) : 0;
	}

	const media = new Map<number, OtioMedia>();
	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			node.forEach(visit);
			return;
		}
		if (!isObject(node)) return;
		if (node.OTIO_SCHEMA === "ExternalReference.1" && typeof node.target_url === "string") {
			const fc =
				isObject(node.metadata) && isObject(node.metadata.filmcraft) ? node.metadata.filmcraft : {};
			const item = Number(fc.item);
			const filePath = resolveUrl(node.target_url);
			if (Number.isInteger(item) && filePath && !media.has(item)) {
				// the media's probe info: { start_timecode: frames | null, video: { frame_rate } | null }
				const info = isObject(fc.info) ? fc.info : {};
				const video = isObject(info.video) ? info.video : null;
				let frameRate: FrameRate | null = null;
				try {
					frameRate = video ? parseFrameRate(video.frame_rate, false) : null;
				} catch {
					// no usable rate, the clip falls back to the sequence rate
				}
				const start = Number(info.start_timecode);
				media.set(item, {
					filePath,
					name: typeof node.name === "string" ? node.name : "",
					frameRate,
					startFrame: Number.isInteger(start) ? start : 0,
				});
			}
		}
		for (const value of Object.values(node)) {
			if (typeof value === "object") visit(value);
		}
	};
	visit(otio.tracks);
	return { startTimecode, media };
}

// ---------------------------------------------------------------------------------------------
// Timeline snapshot
// ---------------------------------------------------------------------------------------------

/**
 * The snapshot from sequence.inspect (exact frames) and the OTIO export (start timecode, files
 * and their rates). Files without a frame rate (audio) count frames at the sequence rate.
 */
export function buildSnapshot(seq: InspectedSequence, otio: OtioInfo): TimelineSnapshot {
	const frameRate = parseFrameRate(seq.settings.frame_rate, seq.settings.drop_frame);
	const start = otio.startTimecode;
	const mediaItems = new Map<number, MediaItem>();

	const toTrack = (track: InspectedTrack, type: Track["type"]): Track => ({
		id: String(track.id),
		type,
		name: track.name,
		clips: track.items
			.filter((item) => item.enabled)
			.map((item): Clip => {
				const media = otio.media.get(item.item);
				const mediaRate = media?.frameRate ?? frameRate;
				if (media && !mediaItems.has(item.item)) {
					mediaItems.set(item.item, {
						id: String(item.item),
						name: media.name,
						type,
						filePath: media.filePath,
						frameRate: mediaRate,
						startTimecode: formatTimecode(media.startFrame, mediaRate),
						metadata: {},
					});
				}
				const colorName = item.customLabelColor ? null : item.label;
				const hex = item.customLabelColor ?? (colorName ? labelHex(colorName) : null);
				return {
					id: String(item.clip),
					name: item.name,
					mediaId: media ? String(item.item) : null,
					startFrameIndex: start + item.startFrame,
					durationFrameCount: item.durationFrames,
					sourceStartFrameIndex: media
						? media.startFrame + frameAtTick(item.sourceIn, mediaRate)
						: null,
					speed: item.speed,
					metadata: item.reverse ? { reverse: true } : {},
					color: hex ? { name: colorName ?? hex, hex } : null,
				};
			}),
	});

	return {
		id: String(seq.id),
		name: seq.name ?? "",
		tracks: [
			...seq.video.map((track) => toTrack(track, "video")),
			...seq.audio.map((track) => toTrack(track, "audio")),
		],
		mediaItems: [...mediaItems.values()],
		frameRate,
		startFrameIndex: start,
		durationFrameCount: seq.durationFrames,
		metadata: { host: "FilmCraft" },
	};
}

// ---------------------------------------------------------------------------------------------
// Marker ids
// ---------------------------------------------------------------------------------------------

/** "<sequence item id>:<marker id>", marker ids are only unique within their sequence */
export const markerNleId = (sequenceId: number, markerId: number) => `${sequenceId}:${markerId}`;

/** The marker id of an nleId from this sequence, else null */
export function markerIdOf(nleId: string | null, sequenceId: number): number | null {
	if (!nleId) return null;
	const match = /^(\d+):(\d+)$/.exec(nleId);
	if (!match || Number(match[1]) !== sequenceId) return null;
	return Number(match[2]);
}
