import { describe, expect, it } from "vitest";
import {
	checkHlsSize,
	displaySize,
	hlsArgs,
	hlsDuration,
	isProxyRendition,
	parseHlsPlaylist,
	PROXY_RENDITIONS,
	proxyCodecs,
	selectRenditions,
} from "../../src/media/hls.ts";

const byHeight = (height: number) => PROXY_RENDITIONS.find((r) => r.height === height)!;
const r2160 = byHeight(2160);
const r1080 = byHeight(1080);
const r720 = byHeight(720);
const r480 = byHeight(480);

const playlist = (segments: [duration: number, length: number, offset: number][], init = "800@0") =>
	[
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-PLAYLIST-TYPE:VOD",
		`#EXT-X-MAP:URI="pipe:3",BYTERANGE="${init}"`,
		...segments.flatMap(([d, l, o]) => [
			`#EXTINF:${d.toFixed(6)},`,
			`#EXT-X-BYTERANGE:${l}@${o}`,
			"pipe:3",
		]),
		"#EXT-X-ENDLIST",
		"",
	].join("\n");

describe("selectRenditions", () => {
	it.each([
		["UHD 3840x2160", 3840, 2160, [2160, 1080, 720, 480]],
		["DCI 4K 4096x2160", 4096, 2160, [2160, 1080, 720, 480]],
		["4K scope 4096x1716", 4096, 1716, [2160, 1080, 720, 480]],
		["1440p doesn't get 2160p", 2560, 1440, [1080, 720, 480]],
		["portrait 4K 2160x3840", 2160, 3840, [2160, 1080, 720, 480]],
		["FullHD", 1920, 1080, [1080, 720, 480]],
		["a pixel short of FullHD still gets 1080p", 1919, 1080, [1080, 720, 480]],
		["scope 1920x800", 1920, 800, [1080, 720, 480]],
		["4:3 1440x1080", 1440, 1080, [1080, 720, 480]],
		["720p", 1280, 720, [720, 480]],
		["between 720p and 480p", 1000, 562, [480]],
		// fitting 1080x1920 into the 2160p box would upscale it to 1215x2160
		["portrait 1080x1920", 1080, 1920, [1080, 720, 480]],
		// fitting 720x1280 into the 1080p box gives 608x1080, still smaller than the source
		["portrait 720x1280", 720, 1280, [1080, 720, 480]],
		["portrait 360x640", 360, 640, [480]],
	])("%s", (_name, width, height, heights) => {
		expect(selectRenditions({ width, height }).map((r) => r.height)).toEqual(heights);
	});

	it("a source smaller than every rendition gets the smallest one", () => {
		expect(selectRenditions({ width: 640, height: 360 })).toEqual([r480]);
	});

	it("nothing to pick from, nothing picked", () => {
		expect(selectRenditions({ width: 640, height: 360 }, [])).toEqual([]);
	});
});

describe("displaySize", () => {
	it.each([
		[undefined, 1920, 1080],
		[null, 1920, 1080],
		[0, 1920, 1080],
		[90, 1080, 1920],
		[-90, 1080, 1920],
		[180, 1920, 1080],
		[270, 1080, 1920],
	])("rotation %s", (rotation, width, height) => {
		expect(displaySize({ width: 1920, height: 1080, rotation })).toEqual({ width, height });
	});
});

describe("isProxyRendition", () => {
	it("accepts exactly the configured renditions", () => {
		expect(PROXY_RENDITIONS.every(isProxyRendition)).toBe(true);
		expect(isProxyRendition({ ...r720, bitRate: r720.bitRate + 1 })).toBe(false);
		expect(isProxyRendition({ width: 2560, height: 1440, bitRate: 12_000_000 })).toBe(false);
	});
});

describe("proxyCodecs", () => {
	it("names AAC only with audio", () => {
		expect(proxyCodecs(true, r1080)).toBe("avc1.64002a,mp4a.40.2");
		expect(proxyCodecs(false, r1080)).toBe("avc1.64002a");
	});

	it("names the level of the rendition: 4.2 up to 1080p, 5.2 for 2160p", () => {
		expect([r2160, r1080, r720, r480].map((r) => proxyCodecs(false, r))).toEqual([
			"avc1.640034",
			"avc1.64002a",
			"avc1.64002a",
			"avc1.64002a",
		]);
	});
});

describe("hlsArgs", () => {
	const outputs = [
		{ media: "pipe:3", playlist: "/tmp/0.m3u8" },
		{ media: "pipe:4", playlist: "/tmp/1.m3u8" },
	];
	const args = hlsArgs({ input: "in.mov", renditions: [r480, r720], outputs, hasAudio: true });
	const after = (flag: string) => args[args.indexOf(flag) + 1];
	const all = (flag: string) => args.flatMap((arg, i) => (arg === flag ? [args[i + 1]] : []));

	it("decodes once and splits into every rendition, never upscaling", () => {
		expect(args.filter((arg) => arg === "-i")).toHaveLength(1);
		expect(after("-i")).toBe("in.mov");
		expect(after("-filter_complex")).toBe(
			"[0:v:0]split=2[s0][s1];" +
				"[s0]scale=w='min(854,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v0];" +
				"[s1]scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[v1]",
		);
		expect(args).not.toContain("-vf");
	});

	it("gives every output its own bitrate, audio and media/playlist target", () => {
		expect(all("-map")).toEqual(["[v0]", "0:a:0?", "[v1]", "0:a:0?"]);
		expect(all("-b:v")).toEqual(["1200000", "3500000"]);
		expect(all("-maxrate")).toEqual(["1800000", "5250000"]);
		expect(all("-bufsize")).toEqual(["2400000", "7000000"]);
		expect(all("-preset")).toEqual(["faster", "faster"]);
		expect(all("-bf")).toEqual(["0", "0"]);
		expect(all("-force_key_frames")).toEqual(["expr:gte(t,n_forced*2)", "expr:gte(t,n_forced*2)"]);
		expect(all("-b:a")).toEqual(["128000", "128000"]);
		expect(all("-hls_segment_filename")).toEqual(["pipe:3", "pipe:4"]);
		expect(args.at(-1)).toBe("/tmp/1.m3u8");
		expect(args[args.indexOf("pipe:3") + 1]).toBe("/tmp/0.m3u8");
	});

	it("encodes 2160p at level 5.2, the others at 4.2", () => {
		const four = hlsArgs({
			input: "in.mov",
			renditions: [r2160, r1080],
			outputs: [outputs[0]!, outputs[1]!],
			hasAudio: false,
		});
		expect(four.flatMap((arg, i) => (arg === "-level:v" ? [four[i + 1]] : []))).toEqual([
			"5.2",
			"4.2",
		]);
	});

	it("puts global args first", () => {
		const withProgress = hlsArgs({
			input: "in.mov",
			renditions: [r1080],
			outputs: [outputs[0]!],
			hasAudio: true,
			globalArgs: ["-progress", "pipe:1"],
		});
		expect(withProgress.slice(0, 3)).toEqual(["-progress", "pipe:1", "-nostdin"]);
	});

	it("leaves out the audio settings without audio", () => {
		const silent = hlsArgs({
			input: "in.mov",
			renditions: [r1080],
			outputs: [outputs[0]!],
			hasAudio: false,
		});
		expect(silent).not.toContain("-c:a");
		expect(silent).not.toContain("-af");
	});

	it("throws without renditions or with mismatched outputs", () => {
		expect(() => hlsArgs({ input: "x", renditions: [], outputs: [], hasAudio: true })).toThrow(
			"at least one rendition",
		);
		expect(() =>
			hlsArgs({ input: "x", renditions: [r1080, r720], outputs: [outputs[0]!], hasAudio: true }),
		).toThrow("2 renditions but 1 outputs");
	});
});

describe("parseHlsPlaylist", () => {
	it("reads the init section and every segment's byte range", () => {
		expect(
			parseHlsPlaylist(
				playlist([
					[2.002, 1000, 800],
					[2.002, 1200, 1800],
					[0.5, 300, 3000],
				]),
			),
		).toEqual({
			init: { length: 800, offset: 0 },
			segments: [
				{ duration: 2.002, length: 1000, offset: 800 },
				{ duration: 2.002, length: 1200, offset: 1800 },
				{ duration: 0.5, length: 300, offset: 3000 },
			],
		});
	});

	it("accepts CRLF line endings", () => {
		expect(
			parseHlsPlaylist(playlist([[2, 10, 5]], "5@0").replaceAll("\n", "\r\n")).segments,
		).toHaveLength(1);
	});

	it("throws without an init section", () => {
		const text = playlist([[2, 10, 5]]).replace(/#EXT-X-MAP.*\n/, "");
		expect(() => parseHlsPlaylist(text)).toThrow("ffmpeg playlist has no byte ranges");
	});

	it("throws without segments, e.g. a playlist written without single_file", () => {
		expect(() => parseHlsPlaylist(playlist([]))).toThrow("ffmpeg playlist has no byte ranges");
		const separateFiles =
			'#EXTM3U\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="5@0"\n#EXTINF:2.0,\nseg0.m4s\n';
		expect(() => parseHlsPlaylist(separateFiles)).toThrow("ffmpeg playlist has no byte ranges");
	});
});

describe("checkHlsSize / hlsDuration", () => {
	const hls = parseHlsPlaylist(
		playlist([
			[2, 1000, 800],
			[1.5, 500, 1800],
		]),
	);

	it("passes when the last segment ends with the file", () => {
		expect(() => checkHlsSize(hls, 2300)).not.toThrow();
	});

	it("throws for a shorter or longer file", () => {
		expect(() => checkHlsSize(hls, 2299)).toThrow(
			"Playlist ends at byte 2300, but the media file has 2299",
		);
		expect(() => checkHlsSize(hls, 2301)).toThrow("2301");
	});

	it("sums the segment durations", () => {
		expect(hlsDuration(hls)).toBe(3.5);
	});
});
