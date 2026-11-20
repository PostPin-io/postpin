// Electron main process of scripts/screenshots.mjs: opens the panel preview for each program in a
// hidden window, takes a screenshot and measures the areas the plugin tutorial points at
// (data-guide="sync-to-nle/…"), in percent of the screenshot.
// Usage: electron capture.mjs <preview url> <png dir> <json file> <program>...
import { app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [url, pngDir, jsonFile, ...programs] = process.argv.slice(2);
const WIDTH = 1000; // wide enough for the three-column layout (@3xl)
const SCALE = 2; // sharp on high-density screens

app.dock?.hide();
// Dates as an English-speaking user sees them, not as on the machine that runs this
app.commandLine.appendSwitch("lang", "en-US");
// No window shows up, and nothing of the user's Electron apps is touched
app.setPath("userData", join(app.getPath("temp"), "postpin-panel-screenshots"));

// One window for all programs: same origin, so it keeps its renderer process
async function capture(win, program) {
	const log = (step) => process.env.CAPTURE_DEBUG && console.log(`  ${program}: ${step}`);
	// The dev server may reload the page once while it prepares dependencies: try again
	for (let attempt = 1; ; attempt++) {
		try {
			await win.loadURL(`${url}?program=${program}`);
			break;
		} catch (error) {
			if (attempt === 3) throw error;
			log(`load failed, again: ${error.message}`);
		}
	}
	log("loaded");
	// The DevTools protocol sets the size and pixel density and takes the screenshot
	const cdp = win.webContents.debugger;
	if (!cdp.isAttached()) cdp.attach("1.3");
	const metrics = (height) =>
		cdp.sendCommand("Emulation.setDeviceMetricsOverride", {
			width: WIDTH,
			height,
			deviceScaleFactor: SCALE,
			mobile: false,
		});
	await metrics(800);

	const evaluate = async (expression) => {
		const { result, exceptionDetails } = await cdp.sendCommand("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? expression);
		return result.value;
	};

	// Ready once the chosen export is shown: projects, timelines and exports have loaded
	await evaluate(`new Promise((resolve, reject) => {
		const started = Date.now();
		const check = () => {
			const exchange = document.querySelector('[data-guide="sync-to-nle/exchange-with"]');
			if (exchange?.textContent?.includes("Reel 1 v3")) return document.fonts.ready.then(resolve);
			if (Date.now() - started > 15000) return reject(new Error("The panel didn't load"));
			setTimeout(check, 100);
		};
		check();
	})`);

	// As tall as the panel: the grid with the boxes, and a margin below like the one above
	const height = await evaluate(`Math.ceil(
		document.querySelector('[data-guide="sync-to-nle/program"]').parentElement.getBoundingClientRect().bottom + 8
	)`);
	await metrics(height);
	// two frames, so the new size is laid out and painted
	await evaluate(
		"new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))",
	);

	const areas = await evaluate(`Object.fromEntries(
		[...document.querySelectorAll('[data-guide^="sync-to-nle/"]')].map((el) => {
			const r = el.getBoundingClientRect();
			const pct = (v, of) => Math.round((v / of) * 10000) / 100;
			return [
				el.dataset.guide.slice("sync-to-nle/".length),
				[pct(r.left, ${WIDTH}), pct(r.top, ${height}), pct(r.width, ${WIDTH}), pct(r.height, ${height})],
			];
		}),
	)`);

	const { data } = await cdp.sendCommand("Page.captureScreenshot", { format: "png" });
	writeFileSync(join(pngDir, `${program}.png`), Buffer.from(data, "base64"));
	return { width: WIDTH, height, areas };
}

app.whenReady().then(async () => {
	try {
		mkdirSync(pngDir, { recursive: true });
		// Offscreen: a hidden window can't be captured on macOS
		const win = new BrowserWindow({
			show: false,
			width: WIDTH,
			height: 800,
			webPreferences: { offscreen: true, backgroundThrottling: false },
		});
		if (process.env.CAPTURE_DEBUG) {
			win.webContents.on("console-message", (event) => console.log(`  console: ${event.message}`));
		}
		const result = {};
		for (const program of programs) {
			result[program] = await capture(win, program);
			console.log(`  ${program}: ${Object.keys(result[program].areas).length} areas`);
		}
		writeFileSync(jsonFile, `${JSON.stringify(result, null, "\t")}\n`);
		app.exit(0);
	} catch (error) {
		console.error(error);
		app.exit(1);
	}
});
