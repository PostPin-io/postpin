<script lang="ts">
	let { marker }: Props = $props();

	interface Props {
		marker: Marker;
	}

	interface Marker {
		title: string;
		timecode: string;
		description: string;
		category: string;
		author: string;
		id: string;
	}
</script>

<article class="card mx-1 max-w-full overflow-hidden border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4 p-5">
		<div class="flex items-center justify-between gap-3">
			<legend class=" fieldset-legend badge badge-outline">{marker.category}</legend>
			<span class="text-sm font-semibold text-base-content/60 tabular-nums">
				{marker.timecode}
			</span>
		</div>

		<div class="space-y-2">
			<h2 class="card-title text-xl">{marker.title}</h2>
			<p class="leading-relaxed text-base-content/75">{marker.description}</p>
		</div>

		<div
			class="flex items-center justify-between gap-3 border-t border-base-300 pt-3 text-sm text-base-content/60"
		>
			<span>By {marker.author}</span>
			<span class="truncate font-mono text-xs" title={marker.id}>#{marker.id}</span>
		</div>
	</div>
</article>
