const UNITS = {
	B: 1n,
	KB: 10n ** 3n,
	MB: 10n ** 6n,
	GB: 10n ** 9n,
	TB: 10n ** 12n,
	PB: 10n ** 15n,
	KIB: 1n << 10n,
	MIB: 1n << 20n,
	GIB: 1n << 30n,
	TIB: 1n << 40n,
	PIB: 1n << 50n,
} as const;

const PATTERN = /^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i;

/** "50 GB", "1.5 TiB", "1000". KB/MB/GB/TB are decimal, KiB/MiB/GiB/TiB binary. */
export function parseByteSize(input: string): bigint {
	const match = PATTERN.exec(input.trim());
	const unit = (match?.[2] ?? "B").toUpperCase() as keyof typeof UNITS;
	if (!match?.[1] || !(unit in UNITS)) throw new Error(`Invalid byte size: ${input}`);
	// avoid float error: "1.5" → 15 / 10
	const [int, frac = ""] = match[1].split(".");
	const scale = 10n ** BigInt(frac.length);
	return (BigInt(int + frac) * UNITS[unit]) / scale;
}

export function isByteSize(input: string): boolean {
	try {
		parseByteSize(input);
		return true;
	} catch {
		return false;
	}
}

/** Decimal like Finder: 1_500_000_000 → "1.5 GB" */
export function formatByteSize(bytes: bigint | number): string {
	const n = Number(bytes);
	if (n < 0) throw new Error(`Invalid byte size: ${bytes}`);
	const units = ["B", "KB", "MB", "GB", "TB", "PB"];
	const i = n === 0 ? 0 : Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
	const value = n / 1000 ** i;
	return `${i === 0 ? value : value.toFixed(value < 10 ? 2 : 1).replace(/\.?0+$/, "")} ${units[i]}`;
}
