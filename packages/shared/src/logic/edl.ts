// CMX3600 EDLs, which most editing software exports: read in the browser into a cut list
// (cut-list.ts), with the video track, one track per audio channel and the markers.
import { CutListError, type CutList, type CutListEvent, type CutListMarker } from "./cut-list.ts";

const TIMECODE = /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/;

/**
 * The channels of an event's track field: "V" is the picture, "A" (or "A1") and "A2"…"A99" the
 * audio channels, "AA" both of the first two, "B" picture and the first channel, "AA/V" and the like
 * several of them. "NONE" and anything unknown carry nothing.
 */
function channels(field: string): string[] {
	const out = new Set<string>();
	for (const part of field.toUpperCase().split("/")) {
		if (part === "V") out.add("V");
		else if (part === "B") out.add("V").add("A1");
		else if (part === "AA") out.add("A1").add("A2");
		else if (part === "A") out.add("A1");
		else if (/^A\d{1,2}$/.test(part)) out.add(`A${Number(part.slice(1))}`);
	}
	return [...out];
}

/** Resolve's marker comment under an event: `|C:ResolveColorBlue |M:Fix the grade |D:1` */
const RESOLVE_MARKER = /\|C:ResolveColor(\w+)\s*\|M:(.*?)\s*\|D:(\d+)/;
/** Avid's locator: `* LOC: 01:00:10:12 RED     Fix the grade` */
const AVID_LOCATOR = /^\*\s*LOC:\s*(\d{2}:\d{2}:\d{2}[:;]\d{2})\s+(\w+)\s*(.*)$/;

/**
 * The events of a CMX3600 EDL, e.g.
 * `001  AX  V  C  00:00:00:00 00:00:04:00 01:00:00:00 01:00:04:00`, on the video track and the
 * audio channels they use, and its markers. Dissolves and wipes carry a duration between the edit
 * type and the timecodes (`D 024`), so the four timecodes are always the last four tokens. Black
 * and silence (`BL`) are left out. The timecodes stay as they are: an EDL doesn't say its rate.
 *
 * Markers: Resolve writes each marker as an event of its own with a `|C:… |M:… |D:…` comment (its
 * "timeline markers" EDL), so such an event without a clip name is a marker, not a clip; Avid
 * writes `* LOC:` lines.
 */
export function parseEdl(text: string): CutList {
	const lines = text
		.replace(/^\uFEFF/, "") // BOM of Windows editors
		.split(/\r\n|\r|\n/);

	const firstLine = lines.find((l) => l.trim() !== "")?.trim() ?? "";
	if (!firstLine.startsWith("TITLE:")) {
		throw new CutListError('Not an EDL: the first line must start with "TITLE:"');
	}

	const byChannel = new Map<string, CutListEvent[]>();
	const markers: CutListMarker[] = [];
	/** The last event line, for the comments under it */
	type EventLine = { recordIn: string; events: CutListEvent[]; clipName: boolean; marker: boolean };
	let current: EventLine | null = null;
	const markerEvents = new Set<CutListEvent>();

	lines.forEach((raw, i) => {
		const line = raw.trim();
		if (line === "") return;

		const resolve = RESOLVE_MARKER.exec(line);
		if (resolve) {
			if (current) {
				current.marker = true;
				const frames = Number(resolve[3]);
				markers.push({
					name: resolve[2]!.trim() || "Marker",
					note: null,
					at: current.recordIn,
					// Resolve gives point markers a length of 1
					duration: frames > 1 ? frames : 0,
					host: "Resolve",
					label: resolve[1]!,
				});
			}
			return;
		}
		const locator = AVID_LOCATOR.exec(line);
		if (locator) {
			markers.push({
				name: locator[3]!.trim() || "Marker",
				note: null,
				at: locator[1]!,
				duration: 0,
				host: "Avid",
				label: locator[2]!,
			});
			return;
		}
		// a "* FROM CLIP NAME:" comment belongs to the event before it
		const clip = /^\*\s*FROM CLIP NAME:\s*(.+)$/.exec(line)?.[1];
		if (clip !== undefined) {
			if (current) {
				current.clipName = true;
				for (const e of current.events) e.name = clip.trim();
			}
			return;
		}
		if (line.startsWith("*")) return;

		const tokens = line.split(/\s+/);
		// event number, reel, track, edit type and four timecodes: at least 8 tokens
		const [num = "", reel = "", track = ""] = tokens;
		const [sourceIn = "", sourceOut = "", recordIn = "", recordOut = ""] = tokens.slice(-4);
		if (tokens.length < 8 || !/^\d+$/.test(num)) {
			current = null; // headers (FCM:), M2 speed lines, anything else
			return;
		}
		if (![sourceIn, sourceOut, recordIn, recordOut].every((t) => TIMECODE.test(t))) {
			throw new CutListError(`Line ${i + 1}: invalid timecode`);
		}
		const finished = current;
		if (finished?.marker && !finished.clipName) finished.events.forEach((e) => markerEvents.add(e));
		current = { recordIn, events: [], clipName: false, marker: false };
		if (reel === "BL") return;
		for (const channel of channels(track)) {
			const event: CutListEvent = { name: null, in: recordIn, out: recordOut, sourceIn };
			current.events.push(event);
			byChannel.set(channel, [...(byChannel.get(channel) ?? []), event]);
		}
	});
	const last = current as EventLine | null;
	if (last?.marker && !last.clipName) last.events.forEach((e) => markerEvents.add(e));

	// the events that only carry a marker are no clips
	for (const [channel, events] of byChannel) {
		const clips = events.filter((e) => !markerEvents.has(e));
		if (clips.length > 0) byChannel.set(channel, clips);
		else byChannel.delete(channel);
	}
	const audio = [...byChannel.keys()]
		.filter((c) => c !== "V")
		.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
	const video = byChannel.get("V") ?? [];
	if (video.length === 0 && markers.length === 0) {
		throw new CutListError("The EDL has no video events and no markers");
	}

	return {
		format: "edl",
		title: firstLine.slice("TITLE:".length).trim(),
		frameRate: null,
		tracks: [
			...(video.length > 0 ? [{ type: "video" as const, name: "Video 1", events: video }] : []),
			...audio.map((c) => ({
				type: "audio" as const,
				name: `Audio ${c.slice(1)}`,
				events: byChannel.get(c)!,
			})),
		],
		markers,
	};
}

/**
 * Why a chosen file can't be a cut list, from its first bytes and its name; null if it may be an
 * EDL or an FCPXML. Binary timeline formats get a hint what to export instead.
 */
export function unsupportedCutList(head: Uint8Array, fileName: string): string | null {
	const instead = "Export the timeline as an EDL or as FCPXML instead";
	// Microsoft's compound file: AAF (and old Office documents)
	const compound = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => head[i] === b);
	if (compound || /\.aaf$/i.test(fileName)) return `AAF files can't be read here. ${instead}`;
	if (/\.(drp|drt|prproj|fcpbundle|ptx)$/i.test(fileName)) {
		return `Project files can't be read here. ${instead}`;
	}
	// text has no NUL bytes; EDLs and FCPXML are text
	if (head.includes(0)) return `This is no text file. ${instead}`;
	return null;
}
