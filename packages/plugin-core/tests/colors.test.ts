import { describe, expect, it } from "vitest";
import { DEFAULT_MARKER_HEX, closestColor, colorToHex, hexToLab } from "../src/colors.ts";
import type { PaletteColor } from "../src/bridge.ts";

const palette: PaletteColor[] = [
	{ id: "Blue", hex: "#0000FF" },
	{ id: "Red", hex: "#FF0000" },
	{ id: "Green", hex: "#00FF00" },
	{ id: "Yellow", hex: "#FFFF00" },
	{ id: "3", hex: "#FFFFFF", name: "White" },
];

describe("hexToLab", () => {
	// reference values for sRGB / D65
	it.each([
		["#000000", { L: 0, A: 0, B: 0 }],
		["#FFFFFF", { L: 100, A: 0, B: 0 }],
		["#FF0000", { L: 53.24, A: 80.09, B: 67.2 }],
		["#00FF00", { L: 87.73, A: -86.18, B: 83.18 }],
		["#0000FF", { L: 32.3, A: 79.19, B: -107.86 }],
		["#808080", { L: 53.59, A: 0, B: 0 }],
	])("converts %s", (hex, expected) => {
		const lab = hexToLab(hex);
		expect(lab.L).toBeCloseTo(expected.L, 0);
		expect(lab.A).toBeCloseTo(expected.A, 0);
		expect(lab.B).toBeCloseTo(expected.B, 0);
	});

	it("ignores case", () => {
		expect(hexToLab("#3b82f6")).toEqual(hexToLab("#3B82F6"));
	});

	it("uses the linear segment for very dark colors", () => {
		// #010101 is below the sRGB gamma threshold and the L* linear threshold
		const lab = hexToLab("#010101");
		expect(lab.L).toBeGreaterThan(0);
		expect(lab.L).toBeLessThan(0.5);
	});
});

describe("colorToHex", () => {
	it("returns the palette color's hex", () => {
		expect(colorToHex("Red", palette)).toBe("#FF0000");
		expect(colorToHex("3", palette)).toBe("#FFFFFF");
	});

	it("falls back to the default for colors missing from the palette", () => {
		expect(colorToHex("Purple", palette)).toBe(DEFAULT_MARKER_HEX);
		expect(colorToHex("Red", [])).toBe(DEFAULT_MARKER_HEX);
	});

	it("returns the color itself for rgb hosts", () => {
		expect(colorToHex("#123456", "rgb")).toBe("#123456");
	});
});

describe("closestColor", () => {
	it("returns the id of an exact match", () => {
		for (const color of palette) expect(closestColor(color.hex, palette)).toBe(color.id);
	});

	it("returns the perceptually nearest palette color", () => {
		expect(closestColor("#3B82F6", palette)).toBe("Blue");
		expect(closestColor("#E01010", palette)).toBe("Red");
		expect(closestColor("#F0F0F0", palette)).toBe("3");
		expect(closestColor("#DDDD22", palette)).toBe("Yellow");
	});

	it("returns the hex itself for rgb hosts", () => {
		expect(closestColor("#3B82F6", "rgb")).toBe("#3B82F6");
	});

	it("returns an empty id for an empty palette", () => {
		expect(closestColor("#3B82F6", [])).toBe("");
	});

	it("falls back to the first palette color for an unparsable hex", () => {
		expect(closestColor("blue", palette)).toBe("Blue");
	});
});
