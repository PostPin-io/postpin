// Generates the workflow animation of the landing page as Lottie JSON:
//   static/animations/workflow-light.json and workflow-dark.json
//
// A mockup of the PostPin workflow built from plain shapes (bars stand in for text):
//   1. editor window, sliding to the left; a line runs from it to an upload node
//   2. packets travel along the line while the node's ring fills, then the line goes on to the
//      browser, which slides in, and the cut grows out of the node into its player
//   3. three colleagues, each with their own cursor and color, set markers on the review page
//   4. Share: a dialog with the link and a QR code, the link goes to a phone
//   5. the client sets a marker on the phone, it lands in the marker list
//   6. all markers fly back into the editor's timeline
//
// Built in code instead of After Effects, so it can be changed in a text editor and comes in a
// light and a dark variant. Rerun after changing it:
//   node scripts/landing-workflow-lottie.ts
import fs from "node:fs";
import path from "node:path";

const FPS = 30;
/** A second of rest at the start of every round, before the upload begins */
const PAUSE = FPS;
const OP = 540 + PAUSE; // 19 seconds, then it loops
const W = 1600; // the editor on the left, the browser on the right, the upload in between
const H = 500; // tight around the windows, 12:5

// --- Lottie building blocks ----------------------------------------------------------------------

type Vec = number[];
type Ease = "io" | "out" | "in" | "linear" | "hold";
type Key = [frame: number, value: number | Vec, ease?: Ease, tangents?: { to: Vec; ti: Vec }];

const EASES: Record<Exclude<Ease, "hold">, { o: [number, number]; i: [number, number] }> = {
	io: { o: [0.45, 0], i: [0.25, 1] },
	out: { o: [0.2, 0.8], i: [0.3, 1] },
	in: { o: [0.6, 0], i: [0.8, 0.6] },
	linear: { o: [0, 0], i: [1, 1] },
};

const fixed = (k: number | Vec) => ({ a: 0, k });

/** An animated property. Each key eases towards the next one with its own ease. */
function anim(keys: Key[]) {
	const sorted = [...keys].sort((a, b) => a[0] - b[0]);
	return {
		a: 1,
		k: sorted.map(([t, value, ease = "io", tangents], i) => {
			const s = Array.isArray(value) ? value : [value];
			if (i === sorted.length - 1) return { t, s };
			if (ease === "hold") return { t, s, h: 1 };
			const e = EASES[ease];
			const n = s.length;
			return {
				t,
				s,
				o: { x: Array(n).fill(e.o[0]), y: Array(n).fill(e.o[1]) },
				i: { x: Array(n).fill(e.i[0]), y: Array(n).fill(e.i[1]) },
				...(tangents ? { to: tangents.to, ti: tangents.ti } : {}),
			};
		}),
	};
}

type Prop = ReturnType<typeof fixed> | ReturnType<typeof anim>;
const prop = (v: number | Vec | Prop): Prop =>
	typeof v === "object" && !Array.isArray(v) ? v : fixed(v);

type Color = [number, number, number];
function hex(value: string): Color {
	const n = parseInt(value.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Shape = Record<string, unknown>;

const fill = (color: string, opacity: number | Prop = 100): Shape => ({
	ty: "fl",
	c: fixed([...hex(color), 1]),
	o: prop(opacity),
	r: 1,
	bm: 0,
});
const stroke = (color: string, width = 1, opacity: number | Prop = 100): Shape => ({
	ty: "st",
	c: fixed([...hex(color), 1]),
	o: prop(opacity),
	w: fixed(width),
	lc: 2,
	lj: 2,
	bm: 0,
});

type Transform = {
	/** pivot for scale, also where `p` is measured from */
	anchor?: Vec;
	position?: Vec | Prop;
	scale?: Vec | Prop;
	opacity?: number | Prop;
};
function tr({
	anchor = [0, 0],
	position,
	scale = [100, 100],
	opacity = 100,
}: Transform = {}): Shape {
	return {
		ty: "tr",
		a: fixed(anchor),
		p: prop(position ?? anchor),
		s: prop(scale),
		r: fixed(0),
		o: prop(opacity),
		sk: fixed(0),
		sa: fixed(0),
	};
}

function group(items: Shape[], transform: Transform = {}, nm = "group"): Shape {
	// Lottie draws the first item on top; we list them bottom to top
	return { ty: "gr", nm, it: [...[...items].reverse(), tr(transform)] };
}

/**
 * One geometry with its paints. In a Lottie group a fill only paints the shapes before it, so the
 * geometry comes first; of the paints, the last one listed ends up on top.
 */
function primitive(geometry: Shape, paint: Shape[], t: Transform, nm: string): Shape {
	return { ty: "gr", nm, it: [geometry, ...[...paint].reverse(), tr(t)] };
}

/** A rectangle by its top left corner */
function rect(
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
	paint: Shape[],
	t: Transform = {},
): Shape {
	return primitive(
		{ ty: "rc", d: 1, s: fixed([w, h]), p: fixed([x + w / 2, y + h / 2]), r: fixed(r) },
		paint,
		t,
		"rect",
	);
}

function ellipse(cx: number, cy: number, d: number, paint: Shape[], t: Transform = {}): Shape {
	return primitive({ ty: "el", d: 1, s: fixed([d, d]), p: fixed([cx, cy]) }, paint, t, "ellipse");
}

function polygon(points: Vec[], paint: Shape[], t: Transform = {}): Shape {
	const zeros = points.map(() => [0, 0]);
	return primitive(
		{ ty: "sh", d: 1, ks: fixed({ c: true, v: points, i: zeros, o: zeros } as unknown as Vec) },
		paint,
		t,
		"polygon",
	);
}

let nextIndex = 1;
type Layer = Record<string, unknown>;
/** A shape layer. Shapes use canvas coordinates; the transform pivots around `anchor`. */
function layer(nm: string, shapes: Shape[], t: Transform = {}): Layer {
	const anchor = t.anchor ?? [0, 0];
	return {
		ddd: 0,
		ind: nextIndex++,
		ty: 4,
		nm,
		sr: 1,
		ks: {
			o: prop(t.opacity ?? 100),
			r: fixed(0),
			p: prop(t.position ?? anchor),
			a: fixed(anchor),
			s: prop(t.scale ?? [100, 100]),
		},
		ao: 0,
		shapes: [...shapes].reverse(),
		ip: 0,
		op: OP,
		st: 0,
		bm: 0,
	};
}

// --- Look ----------------------------------------------------------------------------------------

const BRAND = {
	blue: "#3d7fff",
	cyan: "#21b8cf",
	green: "#31b86a",
	yellow: "#f5b92f",
	pink: "#e8559a",
	purple: "#8a63d2",
	red: "#e8461d",
};

// The editor is dark in both variants, like the editors themselves
const EDITOR = {
	window: "#17191e",
	border: "#2c3038",
	title: "#22252c",
	panel: "#1f2228",
	text: "#3b404b",
	textStrong: "#5a6170",
	track: "#21242a",
};

type Theme = {
	window: string;
	border: string;
	title: string;
	card: string;
	text: string;
	textStrong: string;
	track: string;
	overlay: number;
	phone: string;
	screen: string;
	cursor: string;
	cursorEdge: string;
};
const THEMES: Record<"light" | "dark", Theme> = {
	light: {
		window: "#ffffff",
		border: "#e2e5ea",
		title: "#f2f4f7",
		card: "#f6f7f9",
		text: "#d5d9e0",
		textStrong: "#b3bac5",
		track: "#eef0f3",
		overlay: 18,
		phone: "#1b1d22",
		screen: "#ffffff",
		cursor: "#111317",
		cursorEdge: "#ffffff",
	},
	dark: {
		window: "#262b34",
		border: "#363d49",
		title: "#2d333d",
		card: "#2f3540",
		text: "#424a57",
		textStrong: "#5b6474",
		track: "#2b313b",
		overlay: 35,
		phone: "#0f1114",
		screen: "#1d232a",
		cursor: "#ffffff",
		cursorEdge: "#111317",
	},
};

/** A still from "the cut": sky, sun and two rows of hills */
function frameArt(x: number, y: number, w: number, h: number): Shape[] {
	return [
		// square corners: rounded ones would only show on the sky, the hills below are square
		rect(x, y, w, h, 0, [fill("#2c4f7c")]),
		rect(x, y + h * 0.45, w, h * 0.55, 0, [fill("#3b6597")]),
		ellipse(x + w * 0.7, y + h * 0.36, h * 0.24, [fill(BRAND.yellow)]),
		polygon(
			[
				[x, y + h],
				[x, y + h * 0.62],
				[x + w * 0.22, y + h * 0.4],
				[x + w * 0.45, y + h * 0.6],
				[x + w * 0.62, y + h * 0.48],
				[x + w, y + h * 0.7],
				[x + w, y + h],
			],
			[fill("#24406a")],
		),
		polygon(
			[
				[x, y + h],
				[x, y + h * 0.82],
				[x + w * 0.3, y + h * 0.66],
				[x + w * 0.58, y + h * 0.84],
				[x + w * 0.8, y + h * 0.74],
				[x + w, y + h * 0.86],
				[x + w, y + h],
			],
			[fill("#16294a")],
		),
	];
}

function diamond(size: number, color: string): Shape {
	const r = size / 2;
	return polygon(
		[
			[0, -r],
			[r, 0],
			[0, r],
			[-r, 0],
		],
		[fill(color)],
	);
}

/** A person: a colored circle with a head and shoulders */
function avatar(cx: number, cy: number, d: number, color: string): Shape[] {
	return [
		ellipse(cx, cy, d, [fill(color)]),
		ellipse(cx, cy - d * 0.12, d * 0.36, [fill("#ffffff", 90)]),
		rect(cx - d * 0.26, cy + d * 0.12, d * 0.52, d * 0.24, d * 0.12, [fill("#ffffff", 90)]),
	];
}

/** Three window dots */
const dots = (x: number, y: number) => [
	ellipse(x, y, 9, [fill("#ff5f57")]),
	ellipse(x + 15, y, 9, [fill("#febc2e")]),
	ellipse(x + 30, y, 9, [fill("#28c840")]),
];

/** Fades a window in and out (whole layer) */
const appear = (inAt: number, outAt: number, length = 15) =>
	anim([
		...(inAt > 0 ? ([[0, 0, "hold"]] as Key[]) : []),
		[inAt, 0, "out"],
		[inAt + length, 100, "hold"],
		[outAt, 100, "io"],
		[outAt + length, 0],
	]);

// --- The scenes ----------------------------------------------------------------------------------

// Key moments (frames)
const T = shifted({
	editorSlide: 20,
	lineDraw: 44,
	uploadStart: 54,
	progressDone: 102,
	browserIn: 106,
	/** the cut lands in the browser's player, which was empty until then */
	cutArrives: 134,
	/** when each colleague sets their marker */
	marker: [158, 173, 190],
	clickShare: 232,
	shareOpen: 238,
	clickCopy: 260,
	shareClose: 284,
	phoneIn: 282,
	tapPhone: 322,
	phoneMarkerArrives: 360,
	flyBack: 385,
	flyBackEnd: 428,
	recenter: 455,
	recentered: 480,
	/** the markers pop away one by one, then the next round starts: no fade, the editor stays */
	markersOut: 515,
});

/** All key moments move back by PAUSE, so every round starts with a second of rest */
function shifted<M extends Record<string, number | number[]>>(moments: M): M {
	const move = (t: number | number[]) => (Array.isArray(t) ? t.map((f) => f + PAUSE) : t + PAUSE);
	return Object.fromEntries(Object.entries(moments).map(([k, t]) => [k, move(t)])) as M;
}

// Layout (canvas coordinates)
const ED = { x: 50, y: 20, w: 560, h: 350 };
/** How far the browser and everything on it sits right of where it would touch the editor */
const DX = 400;
const BR = { x: 530 + DX, y: 40, w: 620, h: 390 };
const PH = { x: 1036 + DX, y: 220, w: 130, h: 250 };
const MODAL = { x: 690 + DX, y: 115, w: 300, h: 210 };
/** The line the upload runs along, and the node on it in the gap */
const LINE_Y = 170;
const NODE = [(ED.x + ED.w + BR.x) / 2, LINE_Y];
const NODE_RADIUS = 46;

const RULER_ED = ED.y + 236;
/** The editor starts in the middle and moves left to make room for the upload */
const ED_START_SHIFT = W / 2 - (ED.x + ED.w / 2);
const RULER_BR = BR.y + 270;
const EDITOR_MARKERS_X = [150, 250, 360, 470];
const BROWSER_MARKERS_X = [600, 690, 790, 875].map((x) => x + DX);
/** One color per person: three colleagues and the client; their markers have it too */
const MARKER_COLORS = [BRAND.yellow, BRAND.pink, BRAND.purple, BRAND.green];
/** The program monitor in the editor */
const MONITOR = { x: ED.x + 199, y: ED.y + 40, w: 324, h: 182 };
const SHARE_BUTTON = { x: BR.x + 556, y: BR.y + 7, w: 52, h: 18 };
const COPY_BUTTON = { x: MODAL.x + 228, y: MODAL.y + 43, w: 52, h: 28 };
const PHONE_BUTTON = { x: PH.x + 14, y: PH.y + 196, w: 102, h: 26 };
const center = (b: { x: number; y: number; w: number; h: number }): Vec => [
	b.x + b.w / 2,
	b.y + b.h / 2,
];

/** A short press: scale down and back */
const press = (at: number, pivot: Vec): Transform => ({
	anchor: pivot,
	scale: anim([
		[0, [100, 100], "hold"],
		[at, [100, 100], "io"],
		[at + 4, [93, 93], "io"],
		[at + 9, [100, 100]],
	]),
});

/** The upload node on the line: a ring fills up while the packets arrive, then a check mark */
function uploadNode(theme: Theme): Shape {
	const [cx, cy] = NODE as [number, number];
	const ring = (color: string, trim?: Prop): Shape => ({
		ty: "gr",
		nm: "ring",
		it: [
			{ ty: "el", d: 1, s: fixed([56, 56]), p: fixed([cx, cy]) },
			...(trim ? [{ ty: "tm", s: fixed(0), e: trim, o: fixed(0), m: 1 }] : []),
			stroke(color, 5),
			tr(),
		],
	});
	const done = T.progressDone;
	const swap = (from: number, to: number) =>
		anim([
			[0, from, "hold"],
			[done, from, "io"],
			[done + 6, to],
		]);
	const check: Shape = {
		ty: "gr",
		nm: "check",
		it: [
			{
				ty: "sh",
				d: 1,
				ks: fixed({
					c: false,
					v: [
						[cx - 10, cy],
						[cx - 3, cy + 7],
						[cx + 11, cy - 7],
					],
					i: [
						[0, 0],
						[0, 0],
						[0, 0],
					],
					o: [
						[0, 0],
						[0, 0],
						[0, 0],
					],
				} as unknown as Vec),
			},
			stroke(BRAND.green, 4.5),
			tr({ opacity: swap(0, 100) }),
		],
	};
	const badge = group(
		[
			ellipse(cx, cy, 76, [fill(theme.window), stroke(theme.border, 1.5)]),
			ring(theme.track),
			ring(
				BRAND.blue,
				anim([
					[0, 0, "hold"],
					[T.uploadStart + 6, 0, "io"],
					[done, 100],
				]),
			),
			// up arrow, turning into the check mark when the upload is done
			polygon(
				[
					[cx, cy - 13],
					[cx + 10, cy - 2],
					[cx + 4, cy - 2],
					[cx + 4, cy + 12],
					[cx - 4, cy + 12],
					[cx - 4, cy - 2],
					[cx - 10, cy - 2],
				],
				[fill(BRAND.blue)],
				{ opacity: swap(100, 0) },
			),
			check,
		],
		{ anchor: [cx, cy], scale: [120, 120] },
		"badge",
	);
	return group(
		[badge],
		{
			anchor: [cx, cy],
			scale: anim([
				[0, [0, 0], "hold"],
				[T.lineDraw + 6, [0, 0], "out"],
				[T.lineDraw + 16, [100, 100]],
			]),
		},
		"upload",
	);
}

/** A straight line that draws itself from left to right between two frames */
function drawnLine(x1: number, x2: number, from: number, to: number, color: string): Shape {
	return {
		ty: "gr",
		nm: "line",
		it: [
			{
				ty: "sh",
				d: 1,
				ks: fixed({
					c: false,
					v: [
						[x1, LINE_Y],
						[x2, LINE_Y],
					],
					i: [
						[0, 0],
						[0, 0],
					],
					o: [
						[0, 0],
						[0, 0],
					],
				} as unknown as Vec),
			},
			{
				ty: "tm",
				s: fixed(0),
				e: anim([
					[0, 0, "hold"],
					[from, 0, "io"],
					[to, 100],
				]),
				o: fixed(0),
				m: 1,
			},
			stroke(color, 3),
			tr(),
		],
	};
}

/**
 * The upload, outside the editor: a line from the editor to the node, packets running along it,
 * and once the node is done the line on to the browser.
 */
function uploadLayer(theme: Theme): Layer {
	const [nx] = NODE as [number, number];
	const start = ED.x + ED.w;
	const nodeLeft = nx - NODE_RADIUS;
	const nodeRight = nx + NODE_RADIUS;
	const packets = Array.from({ length: 8 }, (_, k) => {
		const go = T.uploadStart + k * 6;
		const travel = 14;
		return ellipse(0, LINE_Y, 10, [fill(BRAND.blue)], {
			anchor: [0, LINE_Y],
			position: anim([
				[0, [start + 4, LINE_Y], "hold"],
				[go, [start + 4, LINE_Y], "linear"],
				[go + travel, [nodeLeft - 4, LINE_Y]],
			]),
			opacity: anim([
				[0, 0, "hold"],
				[go, 0, "linear"],
				[go + 2, 100, "hold"],
				[go + travel - 2, 100, "linear"],
				[go + travel, 0],
			]),
		});
	});
	return layer(
		"upload",
		[
			drawnLine(start, nodeLeft, T.lineDraw, T.lineDraw + 10, theme.textStrong),
			drawnLine(nodeRight, BR.x, T.progressDone + 2, T.browserIn + 14, theme.textStrong),
			...packets,
			uploadNode(theme),
		],
		{ opacity: appear(T.lineDraw, T.flyBack + 8, 18) },
	);
}

function editorLayer(): Layer {
	const { x, y, w, h } = ED;
	const shapes: Shape[] = [
		rect(x, y, w, h, 12, [fill(EDITOR.window), stroke(EDITOR.border, 1.5)]),
		rect(x, y, w, 28, 12, [fill(EDITOR.title)]),
		rect(x, y + 16, w, 12, 0, [fill(EDITOR.title)]),
		...dots(x + 18, y + 14),
		rect(x + w / 2 - 50, y + 10, 100, 8, 4, [fill(EDITOR.text)]),
		// media bin
		rect(x + 16, y + 40, 154, 182, 8, [fill(EDITOR.panel)]),
		...[0, 1, 2, 3, 4, 5].flatMap((i) =>
			frameArt(x + 26 + (i % 2) * 70, y + 52 + Math.floor(i / 2) * 56, 62, 35),
		),
		...[0, 1, 2, 3, 4, 5].map((i) =>
			rect(x + 26 + (i % 2) * 70, y + 92 + Math.floor(i / 2) * 56, 44, 5, 2, [fill(EDITOR.text)]),
		),
		// program monitor
		rect(x + 178, y + 40, 366, 182, 8, [fill("#0b0d10")]),
		...frameArt(MONITOR.x, MONITOR.y, MONITOR.w, MONITOR.h),
		// timeline
		rect(x + 16, y + 228, w - 32, 110, 6, [fill(EDITOR.panel)]),
		rect(x + 16, RULER_ED - 1, w - 32, 2, 0, [fill(EDITOR.text)]),
		...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) =>
			rect(x + 26 + i * 40, RULER_ED + 2, 1.5, i % 4 === 0 ? 7 : 4, 0, [fill(EDITOR.text)]),
		),
		...[
			[0, 120, BRAND.blue],
			[124, 90, BRAND.cyan],
			[218, 150, BRAND.blue],
			[372, 140, BRAND.cyan],
		].map(([cx, cw, c]) =>
			rect(x + 26 + (cx as number), y + 260, cw as number, 18, 3, [fill(c as string, 75)]),
		),
		rect(x + 26, y + 284, 508, 14, 3, [fill(BRAND.green, 55)]),
		rect(x + 26, y + 304, 300, 14, 3, [fill(BRAND.green, 35)]),
		rect(x + 330, y + 304, 204, 14, 3, [fill(BRAND.green, 35)]),
		// playhead, running through the cut while it uploads
		group(
			[
				rect(-1, RULER_ED - 6, 2, 80, 1, [fill(BRAND.red)]),
				polygon(
					[
						[-6, RULER_ED - 8],
						[6, RULER_ED - 8],
						[0, RULER_ED - 1],
					],
					[fill(BRAND.red)],
				),
			],
			{
				anchor: [0, 0],
				position: anim([
					[0, [x + 40, 0], "hold"],
					[T.uploadStart, [x + 40, 0], "linear"],
					[T.progressDone, [x + 520, 0], "io"],
					[T.flyBack, [x + 520, 0], "io"],
					[T.flyBack + 20, [x + 40, 0]],
				]),
			},
		),
	];
	const [cx, cy] = center(ED) as [number, number];
	return layer("editor", shapes, {
		anchor: center(ED),
		position: anim([
			[0, [cx + ED_START_SHIFT, cy], "hold"],
			[T.editorSlide, [cx + ED_START_SHIFT, cy], "io"],
			[T.lineDraw, [cx, cy], "hold"],
			// back to the middle, where the next round starts
			[T.recenter, [cx, cy], "io"],
			[T.recentered, [cx + ED_START_SHIFT, cy]],
		]),
	});
}

/** Hidden until the cut has landed in the browser, then visible; `delay` in frames after that */
const arrived = (delay: number) =>
	anim([
		[0, 0, "hold"],
		[T.cutArrives - 4 + delay, 0, "out"],
		[T.cutArrives + 4 + delay, 100],
	]);

function browserLayer(theme: Theme): Layer {
	const { x, y, w, h } = BR;
	const shapes: Shape[] = [
		rect(x, y, w, h, 12, [fill(theme.window), stroke(theme.border, 1.5)]),
		rect(x, y, w, 32, 12, [fill(theme.title)]),
		rect(x, y + 20, w, 12, 0, [fill(theme.title)]),
		...dots(x + 18, y + 16),
		rect(x + 170, y + 8, 300, 16, 8, [fill(theme.window)]),
		rect(x + 184, y + 13, 120, 6, 3, [fill(theme.text)]),
		// Share
		rect(
			SHARE_BUTTON.x,
			SHARE_BUTTON.y,
			SHARE_BUTTON.w,
			SHARE_BUTTON.h,
			9,
			[fill(BRAND.blue)],
			press(T.clickShare, center(SHARE_BUTTON)),
		),
		rect(
			SHARE_BUTTON.x + 12,
			SHARE_BUTTON.y + 6,
			28,
			6,
			3,
			[fill("#ffffff", 85)],
			press(T.clickShare, center(SHARE_BUTTON)),
		),
		// the player: empty, with a faint play symbol, until the cut lands in it
		rect(x + 16, y + 44, 374, 210, 0, [fill(theme.card), stroke(theme.border, 1)]),
		polygon(
			[
				[x + 193, y + 131],
				[x + 219, y + 149],
				[x + 193, y + 167],
			],
			[fill(theme.text)],
		),
		group(frameArt(x + 16, y + 44, 374, 210), { opacity: arrived(0) }, "video"),
		rect(x + 16, y + 254, 374, 4, 0, [fill(theme.track)]),
		// timeline under the player; its clips come with the upload too
		rect(x + 16, RULER_BR - 1, 374, 2, 0, [fill(theme.text)]),
		...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) =>
			rect(x + 24 + i * 40, RULER_BR + 2, 1.5, i % 4 === 0 ? 7 : 4, 0, [fill(theme.text)]),
		),
		group(
			[
				...[
					[0, 90, BRAND.blue],
					[94, 70, BRAND.cyan],
					[168, 110, BRAND.blue],
					[282, 92, BRAND.cyan],
				].map(([cx, cw, c]) =>
					rect(x + 16 + (cx as number), RULER_BR + 14, cw as number, 16, 3, [
						fill(c as string, 70),
					]),
				),
				rect(x + 16, RULER_BR + 34, 374, 12, 3, [fill(BRAND.green, 50)]),
			],
			{ opacity: arrived(4) },
			"clips",
		),
		// marker list
		rect(x + 404, y + 44, 200, 8, 4, [fill(theme.textStrong)]),
		rect(x + 404, y + 58, 120, 6, 3, [fill(theme.text)]),
	];
	// a card per marker, sliding in when the marker is set
	const cardTimes = [...T.marker, T.phoneMarkerArrives].map((t) => t + 2);
	cardTimes.forEach((at, i) => {
		const cy = y + 76 + i * 54;
		const slide: Transform = {
			anchor: [x + 504, cy + 22],
			position: anim([
				[0, [x + 504, cy + 34], "hold"],
				[at, [x + 504, cy + 34], "out"],
				[at + 10, [x + 504, cy + 22]],
			]),
			opacity: anim([
				[0, 0, "hold"],
				[at, 0, "out"],
				[at + 10, 100],
			]),
		};
		shapes.push(
			group(
				[
					rect(x + 404, cy, 200, 44, 8, [fill(theme.card), stroke(theme.border, 1)]),
					// who set it: an avatar in their color
					...avatar(x + 426, cy + 22, 24, MARKER_COLORS[i]!),
					rect(x + 446, cy + 11, 96, 7, 3, [fill(theme.textStrong)]),
					rect(x + 446, cy + 26, 140, 6, 3, [fill(theme.text)]),
				],
				slide,
				"card",
			),
		);
	});
	return layer("browser", shapes, {
		anchor: center(BR),
		opacity: appear(T.browserIn, T.flyBack + 8, 18),
		position: anim([
			[0, [BR.x + BR.w / 2 + 60, BR.y + BR.h / 2], "hold"],
			[T.browserIn, [BR.x + BR.w / 2 + 60, BR.y + BR.h / 2], "out"],
			[T.browserIn + 20, center(BR), "hold"],
			[T.flyBack + 8, center(BR), "in"],
			[T.flyBack + 28, [BR.x + BR.w / 2 + 50, BR.y + BR.h / 2]],
		]),
	});
}

/** Seeded pattern for the QR code, so every build looks the same */
function qrModules(size: number): boolean[][] {
	let seed = 7;
	const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const finder = (r: number, c: number) => {
		for (const [fr, fc] of [
			[0, 0],
			[0, size - 7],
			[size - 7, 0],
		] as const) {
			if (r >= fr && r < fr + 7 && c >= fc && c < fc + 7) {
				const dr = r - fr;
				const dc = c - fc;
				const ring = Math.min(dr, dc, 6 - dr, 6 - dc);
				return ring !== 1;
			}
			if (r >= fr - 1 && r <= fr + 7 && c >= fc - 1 && c <= fc + 7) return false;
		}
		return null;
	};
	return Array.from({ length: size }, (_, r) =>
		Array.from({ length: size }, (_, c) => finder(r, c) ?? random() > 0.52),
	);
}

function shareLayer(theme: Theme): Layer {
	const { x, y, w, h } = MODAL;
	const qrSize = 21;
	const qrBox = 100;
	const cell = qrBox / qrSize;
	// all modules in one group with one fill, which keeps the file small
	const modules = qrModules(qrSize).flatMap((row, r) =>
		row.flatMap((on, c) =>
			on
				? [
						{
							ty: "rc",
							d: 1,
							s: fixed([cell + 0.3, cell + 0.3]),
							p: fixed([x + 20 + (c + 0.5) * cell, y + 86 + (r + 0.5) * cell]),
							r: fixed(0),
						},
					]
				: [],
		),
	);
	const qr = [{ ty: "gr", nm: "qr", it: [...modules, fill("#111317"), tr()] } as Shape];
	const shapes: Shape[] = [
		rect(BR.x, BR.y, BR.w, BR.h, 12, [fill("#000000", theme.overlay)]),
		group(
			[
				rect(x, y, w, h, 12, [fill(theme.window), stroke(theme.border, 1.5)]),
				rect(x + 20, y + 18, 120, 9, 4, [fill(theme.textStrong)]),
				rect(x + 20, y + 43, 200, 28, 7, [fill(theme.card), stroke(theme.border, 1)]),
				rect(x + 32, y + 54, 130, 6, 3, [fill(theme.text)]),
				rect(
					COPY_BUTTON.x,
					COPY_BUTTON.y,
					COPY_BUTTON.w,
					COPY_BUTTON.h,
					7,
					[fill(BRAND.blue)],
					press(T.clickCopy, center(COPY_BUTTON)),
				),
				rect(
					COPY_BUTTON.x + 14,
					COPY_BUTTON.y + 11,
					24,
					6,
					3,
					[fill("#ffffff", 85)],
					press(T.clickCopy, center(COPY_BUTTON)),
				),
				rect(x + 14, y + 80, qrBox + 12, qrBox + 12, 6, [fill("#ffffff"), stroke(theme.border, 1)]),
				...qr,
				rect(x + 140, y + 92, 120, 7, 3, [fill(theme.textStrong)]),
				rect(x + 140, y + 108, 100, 6, 3, [fill(theme.text)]),
				rect(x + 140, y + 122, 130, 6, 3, [fill(theme.text)]),
				rect(x + 140, y + 158, 120, 26, 7, [stroke(theme.textStrong, 1.5)]),
				rect(x + 160, y + 168, 80, 6, 3, [fill(theme.textStrong)]),
			],
			{
				anchor: center(MODAL),
				scale: anim([
					[0, [94, 94], "hold"],
					[T.shareOpen, [94, 94], "out"],
					[T.shareOpen + 10, [100, 100]],
				]),
			},
			"dialog",
		),
	];
	return layer("share", shapes, { opacity: appear(T.shareOpen, T.shareClose, 10) });
}

function phoneLayer(theme: Theme): Layer {
	const { x, y, w, h } = PH;
	const shapes: Shape[] = [
		rect(x, y, w, h, 22, [fill(theme.phone)]),
		rect(x + 6, y + 6, w - 12, h - 12, 17, [fill(theme.screen)]),
		rect(x + w / 2 - 20, y + 12, 40, 8, 4, [fill(theme.phone)]),
		...avatar(x + 22, y + 37, 16, MARKER_COLORS[3]!),
		rect(x + 36, y + 34, 60, 7, 3, [fill(theme.textStrong)]),
		...frameArt(x + 14, y + 52, w - 28, 58),
		rect(x + 14, y + 116, w - 28, 4, 2, [fill(theme.track)]),
		rect(x + 14, y + 132, 90, 6, 3, [fill(theme.text)]),
		rect(x + 14, y + 146, 70, 6, 3, [fill(theme.text)]),
		rect(
			PHONE_BUTTON.x,
			PHONE_BUTTON.y,
			PHONE_BUTTON.w,
			PHONE_BUTTON.h,
			13,
			[fill(BRAND.blue)],
			press(T.tapPhone, center(PHONE_BUTTON)),
		),
		rect(
			PHONE_BUTTON.x + 26,
			PHONE_BUTTON.y + 10,
			50,
			6,
			3,
			[fill("#ffffff", 85)],
			press(T.tapPhone, center(PHONE_BUTTON)),
		),
		// the tap
		ellipse(PHONE_BUTTON.x + 51, PHONE_BUTTON.y + 13, 30, [fill("#ffffff", 50)], {
			anchor: [PHONE_BUTTON.x + 51, PHONE_BUTTON.y + 13],
			scale: anim([
				[0, [0, 0], "hold"],
				[T.tapPhone, [20, 20], "out"],
				[T.tapPhone + 14, [160, 160]],
			]),
			opacity: anim([
				[0, 0, "hold"],
				[T.tapPhone, 100, "out"],
				[T.tapPhone + 14, 0],
			]),
		}),
	];
	return layer("phone", shapes, {
		anchor: center(PH),
		opacity: appear(T.phoneIn, T.flyBack + 8, 16),
		position: anim([
			[0, [x + w / 2, y + h / 2 + 50], "hold"],
			[T.phoneIn, [x + w / 2, y + h / 2 + 50], "out"],
			[T.phoneIn + 18, center(PH), "hold"],
			[T.flyBack + 8, center(PH), "in"],
			[T.flyBack + 28, [x + w / 2 + 40, y + h / 2]],
		]),
	});
}

/** The cut, growing out of the upload node into the browser's player */
function cutLayer(): Layer {
	const end = [BR.x + 16 + 187, BR.y + 44 + 105];
	// the art is 80 wide: about the node's size at the start, the player's at the end
	const endScale = (374 / 80) * 100;
	const leave = T.progressDone + 8;
	const arrive = T.cutArrives;
	return layer("cut", frameArt(-40, -22.5, 80, 45), {
		position: anim([
			[0, NODE, "hold"],
			[leave, NODE, "io"],
			[arrive, end],
		]),
		scale: anim([
			[0, [70, 70], "hold"],
			[leave, [70, 70], "io"],
			[arrive, [endScale, endScale]],
		]),
		opacity: anim([
			[0, 0, "hold"],
			[leave - 2, 0, "out"],
			[leave + 4, 100, "hold"],
			[arrive - 4, 100, "io"],
			[arrive + 6, 0],
		]),
	});
}

/** The share link on its way from the dialog to the phone */
function linkLayer(): Layer {
	const start = [MODAL.x + 120, MODAL.y + 57];
	const end = [PH.x + PH.w / 2, PH.y + 80];
	return layer(
		"link",
		[
			rect(-46, -12, 92, 24, 12, [fill(BRAND.blue)]),
			ellipse(-30, 0, 9, [fill("#ffffff")]),
			rect(-20, -3, 50, 6, 3, [fill("#ffffff", 85)]),
		],
		{
			position: anim([
				[0, start, "hold"],
				[T.clickCopy + 8, start, "io", { to: [80, -60], ti: [-20, -80] }],
				[T.phoneIn + 26, end],
			]),
			opacity: anim([
				[0, 0, "hold"],
				[T.clickCopy + 6, 0, "out"],
				[T.clickCopy + 12, 100, "hold"],
				[T.phoneIn + 22, 100, "io"],
				[T.phoneIn + 30, 0],
			]),
		},
	);
}

/**
 * A marker: pops up where it is set, flies back into the editor's timeline and stays there until
 * the round ends. The client's marker starts on the phone and goes through the browser first.
 */
function markerLayer(i: number): Layer {
	const color = MARKER_COLORS[i]!;
	const onBrowser = [BROWSER_MARKERS_X[i]!, RULER_BR];
	const onEditor = [EDITOR_MARKERS_X[i]!, RULER_ED];
	const leave = T.flyBack + i * 5;
	const land = T.flyBackEnd + i * 5;
	const arc = { to: [0, -140], ti: [60, -120] };
	const fromPhone = i === 3;
	const onPhone = [PH.x + 14 + 72, PH.y + 118];
	const setAt = fromPhone ? T.tapPhone + 4 : T.marker[i]!;

	const recentered = [onEditor[0]! + ED_START_SHIFT, onEditor[1]!];
	const home: Key[] = [
		[land, onEditor, "hold"],
		[T.recenter, onEditor, "io"],
		[T.recentered, recentered],
	];
	const position: Key[] = fromPhone
		? [
				[0, onPhone, "hold"],
				[setAt + 10, onPhone, "io", { to: [-60, -80], ti: [60, -60] }],
				[T.phoneMarkerArrives, onBrowser, "hold"],
				[leave, onBrowser, "io", arc],
				...home,
			]
		: [[0, onBrowser, "hold"], [leave, onBrowser, "io", arc], ...home];
	return layer("marker", [diamond(16, color)], {
		position: anim(position),
		scale: anim([
			[0, [0, 0], "hold"],
			[setAt, [0, 0], "out"],
			[setAt + 6, [130, 130], "io"],
			[setAt + 12, [100, 100], "hold"],
			[land, [100, 100], "out"],
			[land + 5, [130, 130], "io"],
			[land + 11, [100, 100], "hold"],
			// away again before the round starts over, the reverse of the pop when it was set
			[T.markersOut + i * 4, [100, 100], "io"],
			[T.markersOut + i * 4 + 4, [125, 125], "in"],
			[T.markersOut + i * 4 + 10, [0, 0]],
		]),
	});
}

const ARROW = [
	[0, 0],
	[0, 22],
	[6, 17],
	[10, 26],
	[14, 24],
	[10, 15.5],
	[17, 15.5],
];

/** Scale keys for a cursor that clicks at the given frames */
function clicking(at: number[]): Key[] {
	const keys: Key[] = [[0, [100, 100], "hold"]];
	for (const t of at)
		keys.push([t - 3, [100, 100], "io"], [t, [82, 82], "io"], [t + 5, [100, 100], "hold"]);
	return keys;
}

/**
 * A colleague: a cursor in their color with a name tag, like in a shared document. They come in,
 * set their marker on the timeline and leave again, partly at the same time as the others.
 */
function colleagueLayer(i: number): Layer {
	const color = MARKER_COLORS[i]!;
	const at = T.marker[i]!;
	const target = [BROWSER_MARKERS_X[i]! + 1, RULER_BR + 7];
	const from = (
		[
			[470, 330],
			[760, 470],
			[1060, 160],
		] as Vec[]
	).map(([x, y]) => [x! + DX, y!])[i]!;
	const away = (
		[
			[480, 440],
			[880, 480],
			[1100, 250],
		] as Vec[]
	).map(([x, y]) => [x! + DX, y!])[i]!;
	return layer(
		"colleague",
		[
			polygon(ARROW, [fill(color), stroke("#ffffff", 1.5)]),
			rect(15, 21, 54, 18, 9, [fill(color)]),
			rect(23, 27, 38, 6, 3, [fill("#ffffff", 90)]),
		],
		{
			position: anim([
				[0, from, "hold"],
				[at - 24, from, "io"],
				[at - 4, target, "hold"],
				[at + 16, target, "io"],
				[at + 44, away],
			]),
			scale: anim(clicking([at - 2])),
			opacity: anim([
				[0, 0, "hold"],
				[at - 24, 0, "out"],
				[at - 16, 100, "hold"],
				[at + 30, 100, "io"],
				[at + 44, 0],
			]),
		},
	);
}

/** Whoever shares the export: the plain cursor, clicking Share and then Copy */
function cursorLayer(theme: Theme): Layer {
	const share = center(SHARE_BUTTON);
	const copy = center(COPY_BUTTON);
	const from = [930 + DX, 470];
	return layer("cursor", [polygon(ARROW, [fill(theme.cursor), stroke(theme.cursorEdge, 1.5)])], {
		position: anim([
			[0, from, "hold"],
			[T.clickShare - 30, from, "io"],
			[T.clickShare - 3, share, "hold"],
			[T.clickShare + 8, share, "io"],
			[T.clickCopy - 3, copy, "hold"],
			[T.clickCopy + 8, copy, "io"],
			[T.clickCopy + 34, [1000 + DX, 530]],
		]),
		scale: anim(clicking([T.clickShare, T.clickCopy])),
		opacity: anim([
			[0, 0, "hold"],
			[T.clickShare - 32, 0, "out"],
			[T.clickShare - 22, 100, "hold"],
			[T.clickCopy + 20, 100, "io"],
			[T.clickCopy + 34, 0],
		]),
	});
}

// --- Output --------------------------------------------------------------------------------------

function build(variant: "light" | "dark") {
	nextIndex = 1;
	const theme = THEMES[variant];
	// bottom to top
	const layers = [
		editorLayer(),
		uploadLayer(theme),
		browserLayer(theme),
		// the colleagues' markers sit under the share dialog; when they fly back it is gone
		...[0, 1, 2].map(markerLayer),
		shareLayer(theme),
		phoneLayer(theme),
		cutLayer(),
		linkLayer(),
		// the client's marker starts on the phone, so it has to be above it
		markerLayer(3),
		...[0, 1, 2].map(colleagueLayer),
		cursorLayer(theme),
	];
	return {
		v: "5.7.0",
		fr: FPS,
		ip: 0,
		op: OP,
		w: W,
		h: H,
		nm: `PostPin workflow (${variant})`,
		ddd: 0,
		assets: [],
		// The phases, for the step captions under the animation (WorkflowAnimation reports them)
		markers: [
			{ cm: "upload", tm: 0, dr: T.cutArrives },
			{ cm: "review", tm: T.cutArrives, dr: T.flyBack - T.cutArrives },
			{ cm: "back", tm: T.flyBack, dr: OP - T.flyBack },
		],
		layers: layers.reverse(),
	};
}

const out = path.join(import.meta.dirname, "../static/animations");
for (const variant of ["light", "dark"] as const) {
	const file = path.join(out, `workflow-${variant}.json`);
	// Two decimals are a hundredth of a pixel, and at most about 1/255 per color channel
	const round = (_key: string, value: unknown) =>
		typeof value === "number" ? Math.round(value * 100) / 100 : value;
	fs.writeFileSync(file, JSON.stringify(build(variant), round));
	console.log(`${file}: ${Math.round(fs.statSync(file).size / 1024)} KB`);
}
