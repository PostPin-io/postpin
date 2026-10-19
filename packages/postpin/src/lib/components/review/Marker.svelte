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

<div>
	<h1 class="text-2xl font-bold">{marker.title}</h1>
	<p>{marker.timecode}</p>
	<p>{marker.description}</p>
	<p>{marker.category}</p>
	<p>{marker.author}</p>
	<p>{marker.id}</p>
</div>
