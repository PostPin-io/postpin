import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLocalStorage } from "../../../../helpers/local-storage.ts";

/** markerFilter is a singleton that loads on import, so import fresh per test */
async function load() {
	vi.resetModules();
	return (await import("#lib/components/review/markerFilter.svelte.ts")).markerFilter;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("markerFilter", () => {
	it("starts empty and lets everything through", async () => {
		stubLocalStorage();
		const f = await load();
		expect(f.categoryIds).toEqual([]);
		const markers = [{ categoryId: "a" }, { categoryId: "b" }];
		expect(f.apply(markers)).toBe(markers);
	});

	it("toggle adds and removes, apply filters, state persists", async () => {
		const data = stubLocalStorage();
		const f = await load();
		f.toggle("a");
		f.toggle("b");
		expect(f.isActive("a")).toBe(true);
		expect(f.apply([{ categoryId: "a" }, { categoryId: "c" }])).toEqual([{ categoryId: "a" }]);
		f.toggle("a");
		expect(f.categoryIds).toEqual(["b"]);
		expect(JSON.parse(data.get("CategoryFilter")!)).toEqual(["b"]);
	});

	it("clear empties and persists", async () => {
		const data = stubLocalStorage();
		const f = await load();
		f.toggle("a");
		f.clear();
		expect(f.categoryIds).toEqual([]);
		expect(data.get("CategoryFilter")).toBe("[]");
	});

	it("loads a stored list, dropping non-strings", async () => {
		const data = stubLocalStorage();
		data.set("CategoryFilter", JSON.stringify(["a", 1, null, "b"]));
		expect((await load()).categoryIds).toEqual(["a", "b"]);
	});

	it("migrates the old format (a single plain id)", async () => {
		const data = stubLocalStorage();
		data.set("CategoryFilter", "cm1abc");
		expect((await load()).categoryIds).toEqual(["cm1abc"]);
	});

	it("works without localStorage (SSR)", async () => {
		vi.stubGlobal("localStorage", undefined);
		expect((await load()).categoryIds).toEqual([]);
	});

	it("does not throw when storage is blocked", async () => {
		stubLocalStorage({ blocked: true });
		const f = await load();
		expect(() => f.toggle("a")).not.toThrow();
	});
});
