<script lang="ts">
	import { formatByteSize } from "@postpin-io/shared/logic/bytes";
	import { usagePercent } from "./usage.ts";

	let { used, quota }: { used: bigint; quota: bigint | null } = $props();

	const percent = $derived(quota === null ? null : usagePercent(used, quota));
</script>

<div class="flex min-w-40 flex-col gap-1">
	<span class="text-sm tabular-nums">
		{formatByteSize(used)}
		<span class="opacity-60">
			{quota === null ? "· unlimited" : `of ${formatByteSize(quota)}`}
		</span>
	</span>
	{#if percent !== null}
		<progress
			class="progress w-full"
			class:progress-primary={percent < 90}
			class:progress-warning={percent >= 90 && percent < 100}
			class:progress-error={percent >= 100}
			value={Math.min(percent, 100)}
			max="100"
			aria-label="{Math.round(percent)} % used"
		></progress>
	{/if}
</div>
