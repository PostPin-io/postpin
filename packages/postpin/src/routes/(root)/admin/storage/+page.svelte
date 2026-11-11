<script lang="ts">
	import PageMeta from "#lib/components/layout/PageMeta.svelte";
	import StorageDonut from "#lib/components/storage/StorageDonut.svelte";
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import { getStorageOverview, measureImages } from "../storage.remote";

	const overview = $derived(await getStorageOverview());
	const quota = (q: bigint | null) => (q === null ? "Unlimited" : formatByteSize(q));
	const overbooked = $derived(
		overview.capacity !== null &&
			overview.allocated !== null &&
			overview.allocated > overview.capacity.total,
	);

	let measuring = $state(false);
	let measureError = $state<string | null>(null);
	async function onMeasure() {
		measuring = true;
		measureError = null;
		try {
			await measureImages();
		} catch (e) {
			measureError = (e as { body?: { message?: string } }).body?.message ?? (e as Error).message;
		} finally {
			measuring = false;
		}
	}
</script>

<PageMeta title="Storage" description="Storage usage and quotas of this PostPin instance." />

<div class="space-y-8">
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Usage</h2>
		{#if overview.capacity}
			<StorageDonut capacity={overview.capacity} byKind={overview.byKind} />
		{:else}
			<p class="text-sm">
				PostPin uses <span class="font-semibold">{formatByteSize(overview.used)}</span>:
				{formatByteSize(overview.byKind.original)} originals,
				{formatByteSize(overview.byKind.proxy)} proxies and
				{formatByteSize(
					overview.byKind.thumbnail + overview.byKind.seekSprites + overview.byKind.shotThumbnails,
				)} images.
			</p>
			<p class="text-sm opacity-60">
				Set <code>STORAGE_CAPACITY</code> or <code>STORAGE_DISK_PATH</code> to see how much is left.
			</p>
		{/if}
		{#if overview.unmeasured > 0}
			<div role="status" class="alert alert-soft text-sm">
				<span>
					The images of {overview.unmeasured}
					{overview.unmeasured === 1 ? "export" : "exports"} were processed before PostPin recorded their
					size, so they're missing above.
				</span>
				<button class="btn btn-sm" disabled={measuring} onclick={onMeasure}>
					Measure now
					{#if measuring}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			</div>
		{/if}
		{#if measureError}<p class="text-sm text-error">{measureError}</p>{/if}
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Quotas</h2>
		<div class="stats stats-vertical border border-base-300 sm:stats-horizontal">
			<div class="stat">
				<div class="stat-title">Default per organization</div>
				<div class="stat-value text-2xl">{quota(overview.defaults.org)}</div>
			</div>
			<div class="stat">
				<div class="stat-title">Default per user</div>
				<div class="stat-value text-2xl">{quota(overview.defaults.user)}</div>
			</div>
			<div class="stat">
				<div class="stat-title">Total allocated</div>
				<div class="stat-value text-2xl">{quota(overview.allocated)}</div>
			</div>
		</div>
		{#if overbooked}
			<div role="alert" class="alert alert-soft text-sm alert-warning">
				The organization quotas add up to more than the available storage. Uploads can fail before
				organizations reach their quota.
			</div>
		{/if}
	</section>
</div>
