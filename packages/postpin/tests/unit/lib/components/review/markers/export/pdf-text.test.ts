import { describe, expect, it } from "vitest";
import { buildPdf } from "#lib/components/review/markers/export/pdf.ts";
import { winAnsi } from "#lib/components/review/markers/export/pdf-text.ts";

const TITLE = "Inside Ballett: John Cranko Schule | Spitzengefühl";

describe("winAnsi", () => {
	it("composes a decomposed umlaut, as macOS writes it (#131)", () => {
		expect(winAnsi(TITLE.normalize("NFD"))).toBe(TITLE);
	});

	it("keeps Latin-1 as it is", () => {
		expect(winAnsi("Ä ö ß é ñ ç ¼ ©")).toBe("Ä ö ß é ñ ç ¼ ©");
	});

	it("puts the characters WinAnsi has beyond Latin-1 at their byte", () => {
		expect(winAnsi("„Spitze“ – A › B …  €")).toBe("\x84Spitze\x93 \x96 A \x9b B \x85  \x80");
	});

	it("keeps the letter of an accent WinAnsi lacks, and drops what it can't show", () => {
		expect(winAnsi("Dvořák")).toBe("Dvorák");
		expect(winAnsi("Super \u{1f44d}\u{1f3fd} da\u200bnke 1\ufe0f\u20e3 \u2764\ufe0f ©")).toBe(
			"Super  danke 1  ©",
		);
		expect(winAnsi("Ballett\u00adschule")).toBe("Ballettschule");
		expect(winAnsi("日本")).toBe("??");
	});

	it("leaves no character above one byte", () => {
		const out = winAnsi("Ωmega \u2190 \u2010 \u2212 \u00a0 \u2009 łódź \u{1f3ac} ﬁ");
		expect([...out].every((char) => char.charCodeAt(0) <= 0xff)).toBe(true);
	});
});

describe("buildPdf", () => {
	it("writes a decomposed title as one-byte text, not UTF-16 (#131)", async () => {
		const blob = await buildPdf({
			title: TITLE.normalize("NFD"),
			location: ["Org", "Projekt"],
			details: "1 marker",
			rows: [
				{
					tcIn: "01:00:00:00",
					tcOut: "",
					duration: "",
					category: "Schnitt",
					categoryColor: null,
					title: "Spitzengefühl".normalize("NFD"),
					description: "",
					author: "Jörg",
				},
			],
			thumbnails: null,
			size: "M",
		});
		const pdf = Buffer.from(await blob.arrayBuffer()).toString("latin1");
		expect(pdf).not.toContain("\u0000S\u0000p");
	});
});
