import { describe, expect, it, vi } from "vitest";
import { prepareCompatibleUpdate } from "../src/autoUpdate.ts";
import type { AvailableUpdate, Updater } from "../src/bridge.ts";

function updater(update: AvailableUpdate | null) {
	return {
		check: vi.fn(async () => update),
		download: vi.fn(async () => {}),
		install: vi.fn(async () => {}),
	} satisfies Updater;
}

describe("prepareCompatibleUpdate", () => {
	it("downloads an update that speaks the server's API version", async () => {
		const u = updater({ version: "1.5.0", apiVersion: 2 });
		await expect(prepareCompatibleUpdate(u, 2)).resolves.toEqual({
			version: "1.5.0",
			apiVersion: 2,
		});
		expect(u.download).toHaveBeenCalledOnce();
		expect(u.install).not.toHaveBeenCalled();
	});

	it("leaves an update alone that a pinned, older server would reject", async () => {
		const u = updater({ version: "2.0.0", apiVersion: 3 });
		await expect(prepareCompatibleUpdate(u, 2)).resolves.toBeNull();
		expect(u.download).not.toHaveBeenCalled();
	});

	it("leaves an update alone whose API version is unknown", async () => {
		const u = updater({ version: "1.5.0", apiVersion: null });
		await expect(prepareCompatibleUpdate(u, 2)).resolves.toBeNull();
		expect(u.download).not.toHaveBeenCalled();
	});

	it("does nothing without an update", async () => {
		const u = updater(null);
		await expect(prepareCompatibleUpdate(u, 2)).resolves.toBeNull();
		expect(u.download).not.toHaveBeenCalled();
	});
});
