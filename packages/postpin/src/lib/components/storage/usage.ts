/** `part` as a percentage of `total` with two decimals, exact for bigint byte counts. */
export function usagePercent(part: bigint, total: bigint): number {
	if (total <= 0n) return part > 0n ? Infinity : 0;
	return Number((part * 10_000n) / total) / 100;
}
