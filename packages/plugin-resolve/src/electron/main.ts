// NOTE: Follow the security guide while implementing plugin app https://www.electronjs.org/docs/tutorial/security

import { app, BrowserWindow, shell } from "electron";
import path from "path";
// @ts-ignore
import WorkflowIntegrationModule from "./WorkflowIntegration.node";
import type { Project, ProjectManager, Resolve, WorkflowIntegrationModule as WI } from "./resolve";
import { Settings } from "../ipc/browser/PostPinResolveAPI";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import http, { type IncomingMessage } from "http";
import https from "https";
import { pipeline } from "stream/promises";
import { setTimeout as sleep } from "timers/promises";

declare const DEV_SERVER_URL: string;

const PLUGIN_ID = "io.postpin.plugin.resolve";

const WorkflowIntegration: WI = WorkflowIntegrationModule;

// Cached objects
let resolveObj: Resolve | null = null;
let projectManagerObj: ProjectManager | null = null;

// Initialize Resolve interface and returns Resolve object.
async function initResolveInterface() {
	const isSuccess = await WorkflowIntegration.Initialize(PLUGIN_ID);
	if (!isSuccess) {
		console.log("Error: Failed to initialize Resolve interface!");
		return null;
	}

	const resolve = await WorkflowIntegration.GetResolve();
	if (!resolve) {
		console.log("Error: Failed to get Resolve object!");
		return null;
	}

	return resolve;
}

// Cleanup Resolve interface.
function cleanup() {
	const isSuccess = WorkflowIntegration.CleanUp();
	if (!isSuccess) {
		console.log("Error: Failed to cleanup Resolve interface!");
	}

	resolveObj = null;
	projectManagerObj = null;
}

// Gets Resolve object.
async function getResolve() {
	if (!resolveObj) {
		resolveObj = await initResolveInterface();
	}

	return resolveObj;
}

// Gets project manager object.
async function getProjectManager() {
	if (!projectManagerObj) {
		const resolve = await getResolve();
		if (resolve) {
			projectManagerObj = (await resolve.GetProjectManager()) ?? null;
			if (!projectManagerObj) {
				console.log("Error: Failed to get ProjectManager object!");
			}
		}
	}

	return projectManagerObj;
}

// Gets current project object.
async function getCurrentProject() {
	const projectManager = await getProjectManager();
	if (!projectManager) return null;

	const project = await projectManager.GetCurrentProject();
	if (!project) {
		console.log("Error: Failed to get current project object!");
	}

	return project;
}

const RENDER_POLL_INTERVAL_MS = 500;

async function waitForRenderJob(project: Project, jobId: string) {
	while (true) {
		const status = await project.GetRenderJobStatus(jobId);
		if (!status?.JobStatus) throw new Error(`Render job ${jobId} not found`);

		switch (status.JobStatus) {
			case "Complete":
				return;
			case "Failed":
			case "Cancelled":
				throw new Error(
					`Render ${status.JobStatus.toLowerCase()}${status.Error ? `: ${status.Error}` : ""}`,
				);
		}

		await sleep(RENDER_POLL_INTERVAL_MS);
	}
}

async function renderTimeline(
	timelineName: string,
	renderPresetName: string,
	targetDirPath: string,
	targetClipName: string,
) {
	const project = await getCurrentProject();
	if (!project) throw new Error("No project open in Resolve");

	const timeline = await project.GetCurrentTimeline();
	if (!timeline) throw new Error("No timeline open in Resolve");

	const isSuccess = await project.SetRenderSettings({
		TargetDir: targetDirPath,
		CustomName: targetClipName,
	});
	if (!isSuccess) throw new Error("Failed to apply render settings");

	const jobId = await project.AddRenderJob();
	if (!jobId) throw new Error("Failed to add render job");

	const job = (await project.GetRenderJobList())?.find((j) => j.JobId === jobId);
	if (!job) throw new Error(`Render job ${jobId} not found`);
	const outputPath = path.join(job.TargetDir, job.OutputFilename);

	if (!(await project.StartRendering(jobId))) throw new Error("Failed to start rendering");
	await waitForRenderJob(project, jobId);

	return outputPath;
}

async function uploadRenderedFile(sourcePath: string, uploadUrl: string) {
	const { size } = await stat(sourcePath);
	const url = new URL(uploadUrl);

	// @ts-ignore
	const request = (url.protocol === "https:" ? https : http).request(url, {
		method: "PUT",
		headers: { "Content-Length": size },
	});
	const response = new Promise<IncomingMessage>((resolve, reject) => {
		request.once("response", resolve);
		request.once("error", reject);
	});

	const [, res] = await Promise.all([pipeline(createReadStream(sourcePath), request), response]);

	let body = "";
	for await (const chunk of res) body += chunk;
	if (!res.statusCode || res.statusCode >= 300) {
		throw new Error(`Upload failed with status ${res.statusCode}: ${body}`);
	}

	return true;
}

// Gets render presets string list.
async function getRenderPresets(): Promise<string[]> {
	const project = await getCurrentProject();
	if (!project) return [];

	return await project.GetRenderPresetList();
}

function setupIPC(win: BrowserWindow) {
	Settings.for(win.webContents).setImplementation({
		renderTimeline,
		getRenderPresets,
		uploadRenderedFile,
		openInBrowser: async (path: string) => {
			shell.openExternal(`http://localhost:5173${path.startsWith("/") ? "" : "/"}${path}`);
			return true;
		},
	});
}

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 900,
		height: 825,
		useContentSize: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	setupIPC(mainWindow);

	mainWindow.on("close", () => {
		cleanup();
		app.quit();
	});

	if (DEV_SERVER_URL) {
		mainWindow.loadURL(DEV_SERVER_URL);
		mainWindow.webContents.openDevTools({ mode: "detach" });
	} else {
		mainWindow.loadFile(path.join(__dirname, "ui/index.html"));
	}
}

app.whenReady().then(() => {
	createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		cleanup();
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
