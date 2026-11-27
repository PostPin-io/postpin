// jsPDF's built-in fonts (Helvetica, Courier) are WinAnsi encoded and take one byte per
// character. A text with any character above 255 goes out as UTF-16 instead, which these fonts
// show with a gap after every letter, and characters like "›" or "…" get lost on the way. So
// every text is turned into WinAnsi bytes before it reaches jsPDF.

// The characters WinAnsi (Windows-1252) has at 0x80–0x9F, where Latin-1 has control codes
const CP1252: Record<string, number> = {
	"€": 0x80,
	"‚": 0x82,
	ƒ: 0x83,
	"„": 0x84,
	"…": 0x85,
	"†": 0x86,
	"‡": 0x87,
	ˆ: 0x88,
	"‰": 0x89,
	Š: 0x8a,
	"‹": 0x8b,
	Œ: 0x8c,
	Ž: 0x8e,
	"‘": 0x91,
	"’": 0x92,
	"“": 0x93,
	"”": 0x94,
	"•": 0x95,
	"–": 0x96,
	"—": 0x97,
	"˜": 0x98,
	"™": 0x99,
	š: 0x9a,
	"›": 0x9b,
	œ: 0x9c,
	ž: 0x9e,
	Ÿ: 0x9f,
};

// Common characters WinAnsi lacks, as the nearest one it has
const SUBSTITUTES: Record<string, string> = {
	"\u2010": "-",
	"\u2011": "-",
	"\u2012": "–",
	"\u2212": "-",
	"\u2032": "'",
	"\u2033": '"',
	"\u2190": "<-",
	"\u2192": "->",
	"\u00a0": " ",
	"\u2009": " ",
	"\u200a": " ",
	"\u202f": " ",
};

/**
 * Dropped instead of shown as "?": zero-width and other invisible characters, emoji (with their
 * skin tones and variation selectors) and combining marks no letter took up
 */
const DROPPED =
	/^(?:[\u200b-\u200d\u2060\ufeff]|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{M})$/u;
/** Combining marks, left over when a letter with an accent WinAnsi lacks is decomposed */
const COMBINING = /\p{M}/gu;

/**
 * The text as WinAnsi bytes, one character per byte, for jsPDF's built-in fonts. Letters with an
 * accent WinAnsi lacks keep the letter ("ř" → "r"), anything else it can't show becomes "?".
 */
export function winAnsi(text: string): string {
	let out = "";
	// NFC first: a decomposed "ü" (u + U+0308, as macOS writes file names) becomes one character
	for (const char of text.normalize("NFC")) out += winAnsiChar(char);
	return out;
}

function winAnsiChar(char: string): string {
	const code = char.codePointAt(0)!;
	if (char in SUBSTITUTES) return winAnsi(SUBSTITUTES[char]);
	// Only above Latin-1: "©" and "®" count as emoji too. A soft hyphen would print as a hyphen
	if ((code > 0xff && DROPPED.test(char)) || char === "\u00ad") return "";
	// Latin-1 without the C1 control codes, which WinAnsi uses for the characters in CP1252
	if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return char;
	if (char in CP1252) return String.fromCharCode(CP1252[char]);
	const base = char.normalize("NFD").replace(COMBINING, "");
	if (base !== char && base.length > 0) return winAnsi(base);
	return "?";
}
