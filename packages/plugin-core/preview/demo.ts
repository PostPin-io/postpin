// Demo bridges and a demo server for the panel preview: one project with two timelines, the open
// timeline linked to "Reel 1", so the panel shows a chosen upload timeline and export like it does
// after the first sync. Names are made up: the screenshots are public.
import type { Capabilities, HostBridge, NleBridge, NleMarker, Settings } from "../src/bridge";

export const PROGRAMS = {
	resolve: {
		hostName: "Resolve",
		palette: [
			{ id: "Blue", hex: "#0000FF" },
			{ id: "Red", hex: "#FF0000" },
			{ id: "Green", hex: "#00FF00" },
			{ id: "Yellow", hex: "#FFFF00" },
		],
		renderPresets: true,
		renderToDisk: true,
		snapshotClips: true,
		customMarkerData: true,
	},
	premiere: {
		hostName: "Premiere Pro",
		palette: [
			{ id: "0", hex: "#00FF00", name: "Green" },
			{ id: "1", hex: "#FF0000", name: "Red" },
		],
		renderPresets: false,
		renderToDisk: false,
		snapshotClips: false,
		customMarkerData: false,
	},
	protools: {
		hostName: "Pro Tools",
		palette: [
			{ id: "1", hex: "#FF0000", name: "Red" },
			{ id: "2", hex: "#0000FF", name: "Blue" },
		],
		renderPresets: false,
		renderToDisk: false,
		snapshotClips: false,
		customMarkerData: false,
	},
} satisfies Record<string, Capabilities>;
export type ProgramId = keyof typeof PROGRAMS;

const NOW = "2026-11-20T10:00:00.000Z";
const ORG = { id: "org-1", name: "Northlight Pictures" };
const PROJECT = {
	id: "project-1",
	name: "Harbor Lights",
	createdAt: NOW,
	updatedAt: NOW,
	nleProjectId: "nle-project",
};
const TIMELINES = [
	{ id: "timeline-1", name: "Reel 1", createdAt: NOW, updatedAt: NOW, nleTimelineId: "nle-reel-1" },
	{ id: "timeline-2", name: "Reel 2", createdAt: NOW, updatedAt: NOW, nleTimelineId: null },
];
const EXPORTS: Record<string, { id: string; name: string; createdAt: string }[]> = {
	"timeline-1": [
		{ id: "export-3", name: "Reel 1 v3", createdAt: "2026-11-19T16:00:00.000Z" },
		{ id: "export-2", name: "Reel 1 v2", createdAt: "2026-11-12T16:00:00.000Z" },
	],
	"timeline-2": [{ id: "export-4", name: "Reel 2 v1", createdAt: "2026-11-18T16:00:00.000Z" }],
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

/** Answers the API requests the panel makes while it shows, nothing more */
export const demoFetch: typeof fetch = async (input) => {
	const url = new URL(input instanceof Request ? input.url : String(input));
	const path = url.pathname.replace(/^\/api/, "");
	if (path === "/v1/projects") return json([{ ...PROJECT, organization: ORG }]);
	if (path === `/v1/projects/${PROJECT.id}`) return json({ ...PROJECT, timelines: TIMELINES });
	const exports = path.match(/^\/v1\/projects\/[^/]+\/timelines\/([^/]+)\/exports$/);
	if (exports) return json({ exports: EXPORTS[exports[1]!] ?? [] });
	if (path === "/v1/config") return json({ apiVersion: 2 });
	return json({ message: "Not in the demo" }, 404);
};

// A frame for the timeline thumbnail: dusk over a harbor, drawn so no image has to be shipped
function thumbnail() {
	const canvas = document.createElement("canvas");
	canvas.width = 320;
	canvas.height = 180;
	const ctx = canvas.getContext("2d")!;
	const sky = ctx.createLinearGradient(0, 0, 0, 120);
	sky.addColorStop(0, "#1d2b4f");
	sky.addColorStop(1, "#e08a4f");
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, 320, 120);
	ctx.fillStyle = "#0f1a2e";
	ctx.fillRect(0, 120, 320, 60);
	ctx.fillStyle = "#f6c56b";
	ctx.beginPath();
	ctx.arc(230, 112, 16, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "#0a1220";
	ctx.fillRect(40, 92, 70, 28);
	ctx.fillRect(60, 70, 8, 22);
	return canvas.toDataURL("image/jpeg", 0.85);
}

const MARKERS: NleMarker[] = [
	{
		nleId: "m1",
		title: "Sky too blue",
		description: "",
		frame: 90_130,
		color: "Blue",
		customData: null,
	},
	{
		nleId: "m2",
		title: "Music too loud",
		description: "",
		frame: 90_412,
		color: "Red",
		customData: null,
	},
];

export function demoNle(program: ProgramId): NleBridge {
	const nothing = async () => {};
	return {
		getCapabilities: async () => PROGRAMS[program],
		getProjectId: async () => "nle-project",
		getTimelineInfo: async () => ({
			name: "Reel 1",
			id: "nle-reel-1",
			projectId: "nle-project",
			projectName: "Harbor Lights",
			thumbnailDataUrl: thumbnail(),
			startFrame: 90_000,
		}),
		getMarkers: async () => MARKERS,
		setMarkers: async (markers) => markers.map((m) => ({ nleId: m.nleId ?? "new" })),
		removeMarkers: nothing,
		clearMarkers: nothing,
		getRenderPresets: async () => ["H.264 Master", "ProRes 422 HQ"],
		renderPreview: () => new Promise(() => {}),
		renderToDisk: () => new Promise(() => {}),
		buildTimelineSnapshot: async () => null,
	};
}

export function demoHost(): HostBridge {
	let settings: Settings = { renderToDisk: false, outputPath: "", filename: "", renderPreset: "" };
	const nothing = async () => {};
	return {
		getServerUrl: async () => "https://app.postpin.io",
		getDefaultServerUrl: async () => "https://app.postpin.io",
		getSession: async () => ({ user: { name: "Demo" } }),
		login: nothing,
		logout: nothing,
		onSessionChanged: () => () => {},
		getSettings: async () => settings,
		saveSettings: async (next) => {
			settings = next;
		},
		getFileSize: async () => 0,
		uploadFile: async () => [],
		openInBrowser: nothing,
		pickDirectory: async () => "",
		setProgress: nothing,
		getToken: async () => "demo",
	};
}
