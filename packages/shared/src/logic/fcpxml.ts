// Final Cut Pro XML (FCPXML), which Final Cut Pro exports instead of an EDL and Resolve offers too.
// The browser turns it into a cut list (cut-list.ts), so a large project file isn't sent at all:
// only its tracks and clips.
import { CutListError, type CutList, type CutListEvent, type CutListMarker } from "./cut-list.ts";
import { formatTimecode, framesPerDay } from "./timecode.ts";
import type { FrameRate } from "../types/TimelineSnapshot.ts";

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
	s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
		e[0] === "#"
			? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10))
			: (ENTITIES[e] ?? m),
	);

/**
 * The elements and attributes of an XML document; text content is left out, FCPXML keeps
 * everything this needs in attributes. Runs in the browser and in Node alike.
 */
function parseXml(xml: string): XmlNode {
	const root: XmlNode = { name: "#root", attrs: {}, children: [] };
	const stack = [root];
	const tag =
		/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
	for (const m of xml.matchAll(tag)) {
		const [, closing, name, rawAttrs, selfClosing] = m;
		if (!name) continue; // comment, CDATA, declaration, doctype
		if (closing) {
			if (stack.length > 1 && stack.at(-1)!.name === name) stack.pop();
			continue;
		}
		const attrs: Record<string, string> = {};
		for (const a of (rawAttrs ?? "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
			attrs[a[1]!] = decode(a[2] ?? a[3] ?? "");
		}
		const node: XmlNode = { name, attrs, children: [] };
		stack.at(-1)!.children.push(node);
		if (!selfClosing) stack.push(node);
	}
	return root;
}

const find = (node: XmlNode, name: string): XmlNode | undefined => {
	for (const child of node.children) {
		if (child.name === name) return child;
		const deeper = find(child, name);
		if (deeper) return deeper;
	}
	return undefined;
};

/** FCPXML time, e.g. "1001/30000s", "3600s" or "0s", as an exact fraction of seconds */
type Time = { n: bigint; d: bigint };
function parseTime(value: string | undefined): Time {
	if (!value) return { n: 0n, d: 1n };
	const m = /^(-?\d+)(?:\/(\d+))?s$/.exec(value.trim());
	if (!m) throw new CutListError(`Invalid time in the FCPXML: ${value}`);
	return { n: BigInt(m[1]!), d: BigInt(m[2] ?? "1") };
}
const addTime = (a: Time, b: Time): Time => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const sub = (a: Time, b: Time): Time => addTime(a, { n: -b.n, d: b.d });
/** Seconds to frames at `rate`, rounded to the nearest frame */
const toFrames = (t: Time, rate: FrameRate) => {
	const num = t.n * BigInt(rate.fpsNumerator);
	const den = t.d * BigInt(rate.fpsDenominator);
	// to the nearest frame; times before 0 don't occur in a timeline
	return num >= 0n ? Number((2n * num + den) / (2n * den)) : Math.round(Number(num) / Number(den));
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The rate of a format's frameDuration, e.g. "1001/30000s" → 30000/1001 */
function rateOf(frameDuration: string | undefined, dropFrame: boolean): FrameRate {
	const t = parseTime(frameDuration);
	const num = Number(t.d);
	const den = Number(t.n);
	if (!(num > 0 && den > 0)) throw new CutListError("The FCPXML has no frame rate");
	const g = gcd(num, den);
	return { fpsNumerator: num / g, fpsDenominator: den / g, dropFrame };
}

/** Elements that show a picture or play sound on the timeline when their asset has one */
const CLIPS = new Set([
	"asset-clip",
	"clip",
	"ref-clip",
	"mc-clip",
	"sync-clip",
	"video",
	"audio",
	"title",
]);

type Piece = { from: number; to: number; lane: number; name: string; source: number };

/**
 * The project's timeline as a cut list, with timecodes at the sequence's own frame rate and its
 * start timecode, like the timeline in the editing software:
 *
 * - every lane with pictures is a video track, from the bottom up: the primary storyline, the
 *   connected clips above it (B-roll) and below it
 * - the sound of the clips and the audio-only clips (music, effects) are audio tracks: the primary
 *   storyline's first, then the lanes below it, then the ones above
 *
 * Gaps, transitions and effects are no clips. A music file with a cover image (a still with sound)
 * counts as audio, otherwise its cover would hide every cut below it.
 */
export function fcpxmlToCutList(xml: string): CutList {
	const doc = parseXml(xml.replace(/^\uFEFF/, ""));
	if (!find(doc, "fcpxml")) throw new CutListError("Not an FCPXML file");
	const project = find(doc, "project");
	const sequence = project && find(project, "sequence");
	const spine = sequence && find(sequence, "spine");
	if (!project || !sequence || !spine) throw new CutListError("The FCPXML has no project timeline");

	const resources = find(doc, "resources")?.children ?? [];
	const byId = new Map(resources.map((r) => [r.attrs["id"], r]));
	const format = byId.get(sequence.attrs["format"]);
	const frameRate = rateOf(format?.attrs["frameDuration"], sequence.attrs["tcFormat"] === "DF");

	/** What a clip element brings onto the timeline */
	const contents = (node: XmlNode) => {
		if (!CLIPS.has(node.name)) return { picture: false, sound: false };
		const enabled = node.attrs["srcEnable"] ?? "all";
		const asset = byId.get(node.attrs["ref"]);
		if (node.name === "audio") return { picture: false, sound: enabled !== "video" };
		// titles, generators, compound clips: their picture; their sound isn't known here
		if (!asset || asset.name !== "asset") return { picture: enabled !== "audio", sound: false };
		const still = byId.get(asset.attrs["format"])?.attrs["name"]?.includes("RateUndefined");
		const hasAudio = asset.attrs["hasAudio"] === "1" && asset.attrs["audioChannels"] !== "0";
		const hasVideo = asset.attrs["hasVideo"] === "1" && !(still && hasAudio);
		return {
			picture: hasVideo && enabled !== "audio",
			sound: hasAudio && enabled !== "video",
		};
	};

	const markers: CutListMarker[] = [];
	const day = framesPerDay(frameRate);
	const tc = (frame: number) => formatTimecode(((frame % day) + day) % day, frameRate);
	/** Final Cut's marker types: to-do markers are done or not, chapters have their own element */
	const markerType = (m: XmlNode) =>
		m.name === "chapter-marker"
			? "Chapter"
			: m.attrs["completed"] === "0"
				? "To-do"
				: m.attrs["completed"] === "1"
					? "Done"
					: "Marker";

	// Final Cut gives point markers a length of one frame
	const markerLength = (m: XmlNode) => {
		const frames = toFrames(parseTime(m.attrs["duration"]), frameRate);
		return frames > 1 ? frames : 0;
	};

	const pictures = new Map<number, Piece[]>();
	const sounds = new Map<number, Piece[]>();
	const add = (into: Map<number, Piece[]>, piece: Piece) =>
		into.set(piece.lane, [...(into.get(piece.lane) ?? []), piece]);
	/**
	 * `toTimeline` maps a time of the parent (its own source time for connected clips, the
	 * sequence's time on the primary storyline) to the sequence's time
	 */
	const walk = (node: XmlNode, toTimeline: (t: Time) => Time, lane: number) => {
		const offset = parseTime(node.attrs["offset"]);
		const duration = parseTime(node.attrs["duration"]);
		const start = parseTime(node.attrs["start"]);
		const timelineIn = toTimeline(offset);
		const { picture, sound } = contents(node);
		const piece: Piece = {
			from: toFrames(timelineIn, frameRate),
			to: toFrames(addTime(timelineIn, duration), frameRate),
			lane,
			name: node.attrs["name"] ?? "Clip",
			source: toFrames(start, frameRate),
		};
		if (piece.to > piece.from) {
			if (picture) add(pictures, piece);
			if (sound) add(sounds, piece);
		}
		// connected clips and secondary storylines count in this clip's source time
		const inside = (t: Time) => addTime(timelineIn, sub(t, start));
		for (const child of node.children) {
			if (child.name === "marker" || child.name === "chapter-marker") {
				// like connected clips, a marker counts in the clip's source time
				markers.push({
					name: (child.attrs["value"] ?? "").trim() || "Marker",
					note: child.attrs["note"]?.trim() || null,
					at: tc(toFrames(inside(parseTime(child.attrs["start"])), frameRate)),
					duration: markerLength(child),
					host: "Final Cut",
					label: markerType(child),
				});
				continue;
			}
			if (child.attrs["lane"] === undefined) continue;
			const childLane = lane + Number(child.attrs["lane"]);
			if (child.name === "spine") {
				const storylineIn = inside(parseTime(child.attrs["offset"]));
				const first = child.children[0] ? parseTime(child.children[0].attrs["offset"]) : null;
				for (const item of child.children) {
					walk(item, (t) => (first ? addTime(storylineIn, sub(t, first)) : storylineIn), childLane);
				}
			} else {
				walk(child, inside, childLane);
			}
		}
	};
	for (const item of spine.children) walk(item, (t) => t, 0);
	if (pictures.size === 0 && markers.length === 0) {
		throw new CutListError("The FCPXML timeline has no video clips and no markers");
	}
	const events = (pieces: Piece[]): CutListEvent[] =>
		[...pieces]
			.sort((a, b) => a.from - b.from)
			.map((p) => ({
				name: p.name.replace(/[\r\n]+/g, " "),
				in: tc(p.from),
				out: tc(p.to),
				sourceIn: tc(p.source),
			}));
	// the primary storyline's sound first, then below it (-1, -2, …), then above it
	const audioOrder = (lane: number) => (lane <= 0 ? -lane : 1000 + lane);
	const audioLanes = [...sounds.keys()].sort((a, b) => audioOrder(a) - audioOrder(b));

	return {
		format: "fcpxml",
		title: (project.attrs["name"] ?? "Timeline").replace(/[\r\n]+/g, " ").slice(0, 500),
		frameRate,
		tracks: [
			...[...pictures.keys()]
				.sort((a, b) => a - b)
				.map((lane, i) => ({
					type: "video" as const,
					name: `Video ${i + 1}`,
					events: events(pictures.get(lane)!),
				})),
			...audioLanes.map((lane, i) => ({
				type: "audio" as const,
				name: `Audio ${i + 1}`,
				events: events(sounds.get(lane)!),
			})),
		],
		markers: markers.sort((x, y) => x.at.localeCompare(y.at)),
	};
}

/** Whether the text of a cut list is an FCPXML document rather than an EDL */
export const isFcpxml = (text: string) => /^\uFEFF?\s*</.test(text);
