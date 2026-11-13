// Start timecode of a QuickTime (.mov) or MP4 file, read in the browser without loading the file:
// only the top-level box headers, the `moov` box and 4 bytes of the first timecode sample.
// mediabunny skips the timecode track, so we read it ourselves.
//
// The timecode lives in a track with the handler "tmcd". Its sample description holds the flags
// (drop-frame), the rate and the frames per second; its first sample, a 32-bit frame number, is
// the start. The track's chunk offset table (stco/co64) says where that sample is in the file.
import { formatTimecode } from "@postpin-io/shared/logic/timecode";

export type QuickTimeTimecode = {
	/** Start frame, counted in the timecode's own rate */
	frame: number;
	dropFrame: boolean;
	/** e.g. 30000/1001 */
	fpsNumerator: number;
	fpsDenominator: number;
	/** "01:00:00:00", or "00:59:58;00" for drop-frame */
	timecode: string;
};

/** Larger `moov` boxes aren't read (an hour of video has a few MB) */
const MAX_MOOV_SIZE = 256 * 1024 * 1024;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

type Box = { type: string; start: number; size: number; headerSize: number };

async function bytes(blob: Blob, start: number, length: number): Promise<DataView> {
	return new DataView(await blob.slice(start, start + length).arrayBuffer());
}

const fourCC = (view: DataView, offset: number) =>
	String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3),
	);

/** A box header at `offset` of `view`, or null if there is none */
function boxAt(view: DataView, offset: number, end: number): Box | null {
	if (offset + 8 > end) return null;
	let size = view.getUint32(offset);
	const type = fourCC(view, offset + 4);
	let headerSize = 8;
	if (size === 1) {
		if (offset + 16 > end) return null;
		size = Number(view.getBigUint64(offset + 8));
		headerSize = 16;
	} else if (size === 0) {
		size = end - offset;
	}
	if (size < headerSize || offset + size > end) return null;
	return { type, start: offset, size, headerSize };
}

/** The children of the box spanning [start, end) in `view` */
function children(view: DataView, start: number, end: number): Box[] {
	const boxes: Box[] = [];
	for (let offset = start; ;) {
		const box = boxAt(view, offset, end);
		if (!box) return boxes;
		boxes.push(box);
		offset += box.size;
	}
}

const child = (view: DataView, parent: Box, type: string) =>
	children(view, parent.start + parent.headerSize, parent.start + parent.size).find(
		(b) => b.type === type,
	);

/** The top-level `moov` box, found by hopping from header to header */
async function findMoov(file: Blob): Promise<Box | null> {
	for (let offset = 0; offset + 8 <= file.size;) {
		const head = await bytes(file, offset, 16);
		let size = head.getUint32(0);
		const type = fourCC(head, 4);
		let headerSize = 8;
		if (size === 1) {
			if (head.byteLength < 16) return null;
			size = Number(head.getBigUint64(8));
			headerSize = 16;
		} else if (size === 0) {
			size = file.size - offset;
		}
		if (size < headerSize) return null;
		if (type === "moov") return { type, start: offset, size, headerSize };
		offset += size;
	}
	return null;
}

/** The timecode track's sample description and the file offset of its first chunk */
function readTimecodeTrack(moov: DataView) {
	for (const trak of children(moov, 8, moov.byteLength).filter((b) => b.type === "trak")) {
		const mdia = child(moov, trak, "mdia");
		const hdlr = mdia && child(moov, mdia, "hdlr");
		// hdlr: version/flags (4), pre_defined (4), handler type (4)
		if (!hdlr || fourCC(moov, hdlr.start + hdlr.headerSize + 8) !== "tmcd") continue;

		const stbl = (() => {
			const minf = child(moov, mdia, "minf");
			return minf && child(moov, minf, "stbl");
		})();
		const stsd = stbl && child(moov, stbl, "stsd");
		if (!stbl || !stsd) continue;
		// stsd: version/flags (4), entry count (4), then the first entry
		const entry = boxAt(moov, stsd.start + stsd.headerSize + 8, stsd.start + stsd.size);
		if (!entry || entry.type !== "tmcd") continue;
		// entry: header (8), reserved (6), data reference index (2), reserved (4),
		// flags (4), time scale (4), frame duration (4), frames per second (1)
		const at = entry.start + 8 + 6 + 2 + 4;
		if (at + 13 > entry.start + entry.size) continue;
		const flags = moov.getUint32(at);
		const timeScale = moov.getUint32(at + 4);
		const frameDuration = moov.getUint32(at + 8);
		if (!timeScale || !frameDuration) continue;

		const stco = child(moov, stbl, "stco");
		const co64 = child(moov, stbl, "co64");
		const table = stco ?? co64;
		if (!table) continue;
		// version/flags (4), entry count (4), offsets
		const tableStart = table.start + table.headerSize;
		if (moov.getUint32(tableStart + 4) === 0) continue;
		const chunkOffset = stco
			? moov.getUint32(tableStart + 8)
			: Number(moov.getBigUint64(tableStart + 8));
		return { flags, timeScale, frameDuration, chunkOffset };
	}
	return null;
}

/**
 * The start timecode of a .mov or .mp4 file, or null if it has none (or isn't one).
 * Works with the `moov` box at the start or at the end of the file.
 */
export async function readQuickTimeTimecode(file: Blob): Promise<QuickTimeTimecode | null> {
	const moovBox = await findMoov(file);
	if (!moovBox || moovBox.size > MAX_MOOV_SIZE || moovBox.start + moovBox.size > file.size) {
		return null;
	}
	const moov = await bytes(file, moovBox.start, moovBox.size);
	const track = readTimecodeTrack(moov);
	if (!track || track.chunkOffset + 4 > file.size) return null;

	const frame = (await bytes(file, track.chunkOffset, 4)).getUint32(0);
	// stored as e.g. 12800/256 for 50 fps
	const divisor = gcd(track.timeScale, track.frameDuration);
	const rate = {
		fpsNumerator: track.timeScale / divisor,
		fpsDenominator: track.frameDuration / divisor,
		dropFrame: (track.flags & 0x0001) !== 0,
	};
	const timecode = formatTimecode(frame, rate);
	if (timecode.startsWith("-")) return null;
	return { frame, ...rate, timecode };
}
