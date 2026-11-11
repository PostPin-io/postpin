<script lang="ts" module>
	export type Capacity =
		{ kind: "fixed"; total: bigint } | { kind: "disk"; total: bigint; free: bigint };

	export type StorageByKind = {
		original: bigint;
		proxy: bigint;
		thumbnail: bigint;
		seekSprites: bigint;
		shotThumbnails: bigint;
	};
</script>

<script lang="ts">
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import { usagePercent } from "./usage.ts";

	let { capacity, byKind }: { capacity: Capacity; byKind: StorageByKind } = $props();

	const max = (a: bigint, b: bigint) => (a > b ? a : b);

	// fixed order, so a kind keeps its color however the sizes change
	const KINDS = [
		{ key: "original", label: "Originals", color: "var(--storage-1)" },
		{ key: "proxy", label: "Proxies", color: "var(--storage-2)" },
		{ key: "thumbnail", label: "Thumbnails", color: "var(--storage-3)" },
		{ key: "seekSprites", label: "Seek images", color: "var(--storage-4)" },
		{ key: "shotThumbnails", label: "Shot thumbnails", color: "var(--storage-5)" },
	] as const;

	const used = $derived(KINDS.reduce((sum, k) => sum + byKind[k.key], 0n));
	const over = $derived(used > capacity.total);

	const segments = $derived([
		...KINDS.map((k) => ({ label: k.label, bytes: byKind[k.key], color: k.color })),
		...(capacity.kind === "disk"
			? [
					{
						label: "Other data on the disk",
						bytes: max(0n, capacity.total - capacity.free - used),
						color: "var(--storage-other)",
					},
				]
			: []),
		{
			label: "Free",
			bytes: capacity.kind === "disk" ? capacity.free : max(0n, capacity.total - used),
			color: "var(--storage-free)",
		},
	]);

	// a small gap between neighbors, so adjacent segments stay apart without relying on color
	const GAP = 0.5;
	const arcs = $derived.by(() => {
		const visible = segments
			.map((s) => ({ ...s, percent: usagePercent(s.bytes, capacity.total) }))
			.filter((s) => s.percent > 0);
		const gap = visible.length > 1 ? GAP : 0;
		let offset = 0;
		return visible.map((s) => {
			const share = Math.min(s.percent, 100 - offset);
			// tiny segments stay visible as a sliver instead of vanishing in the gap
			const length = Math.max(0.3, share - gap);
			const arc = { ...s, dash: `${length} ${100 - length}`, offset: -offset };
			offset += share;
			return arc;
		});
	});

	const formatPercent = (p: number) => (p > 0 && p < 1 ? "<1 %" : `${Math.round(p)} %`);
</script>

<div class="storage-donut flex flex-wrap items-center gap-8">
	<figure class="relative size-44 shrink-0">
		<svg viewBox="0 0 100 100" class="size-full -rotate-90" role="img" aria-label="Storage usage">
			{#if over}
				<circle cx="50" cy="50" r="40" fill="none" stroke-width="14" class="stroke-error">
					<title>PostPin: {formatByteSize(used)}, more than the capacity</title>
				</circle>
			{:else}
				<circle cx="50" cy="50" r="40" fill="none" stroke-width="14" stroke="var(--storage-free)" />
				{#each arcs as arc (arc.label)}
					<circle
						cx="50"
						cy="50"
						r="40"
						fill="none"
						stroke-width="14"
						pathLength="100"
						stroke={arc.color}
						stroke-dasharray={arc.dash}
						stroke-dashoffset={arc.offset}
						class="transition-opacity hover:opacity-75"
					>
						<title>{arc.label}: {formatByteSize(arc.bytes)} ({formatPercent(arc.percent)})</title>
					</circle>
				{/each}
			{/if}
		</svg>
		<figcaption class="absolute inset-0 flex flex-col items-center justify-center">
			<span class="text-2xl font-semibold tabular-nums" class:text-error={over}>
				{formatPercent(usagePercent(used, capacity.total))}
			</span>
		</figcaption>
	</figure>

	<table class="table w-auto table-sm">
		<tbody>
			{#each segments as s (s.label)}
				<tr>
					<td>
						<span class="flex items-center gap-2">
							<span class="size-3 shrink-0 rounded-full" style:background-color={s.color}></span>
							{s.label}
						</span>
					</td>
					<td class="text-right tabular-nums">{formatByteSize(s.bytes)}</td>
					<td class="text-right tabular-nums opacity-60">
						{formatPercent(usagePercent(s.bytes, capacity.total))}
					</td>
				</tr>
			{/each}
			<tr class="font-semibold">
				<td>{capacity.kind === "fixed" ? "Capacity" : "Disk size"}</td>
				<td class="text-right tabular-nums">{formatByteSize(capacity.total)}</td>
				<td></td>
			</tr>
		</tbody>
	</table>
</div>

<style>
	/* categorical slots 1–5 of the dataviz reference palette, stepped for each theme */
	.storage-donut {
		--storage-1: #2a78d6;
		--storage-2: #eb6834;
		--storage-3: #1baf7a;
		--storage-4: #eda100;
		--storage-5: #e87ba4;
		--storage-other: color-mix(in oklab, var(--color-base-content) 35%, transparent);
		--storage-free: var(--color-base-300);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:where(:not([data-theme="light"]))) .storage-donut {
			--storage-1: #3987e5;
			--storage-2: #d95926;
			--storage-3: #199e70;
			--storage-4: #c98500;
			--storage-5: #d55181;
		}
	}
	:global(:root[data-theme="dark"]) .storage-donut {
		--storage-1: #3987e5;
		--storage-2: #d95926;
		--storage-3: #199e70;
		--storage-4: #c98500;
		--storage-5: #d55181;
	}
</style>
