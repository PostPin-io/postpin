<script lang="ts">
	import Marker from "./Marker.svelte";

	let markers: Array<{
		title: string;
		timecode: string;
		description: string;
		category: string;
		author: string;
		id: string;
	}> = [
		{
			title: "Einleitung",
			timecode: "00:00:15",
			description: "Kurze Einführung in das Thema und Vorstellung der wichtigsten Inhalte.",
			category: "Allgemein",
			author: "Max Mustermann",
			id: "1",
		},
		{
			title: "Wichtiger Punkt",
			timecode: "00:01:32",
			description: "Hier wird ein zentraler Aspekt des Videos ausführlich erklärt.",
			category: "Highlight",
			author: "Anna Schmidt",
			id: "2",
		},
		{
			title: "Interessante Szene",
			timecode: "00:03:45",
			description:
				"Eine besonders interessante Szene, die später noch einmal betrachtet werden sollte.",
			category: "Szene",
			author: "Tom Weber",
			id: "3",
		},
		{
			title: "Fehler im Video",
			timecode: "00:05:12",
			description: "An dieser Stelle gibt es einen kleinen Schnittfehler.",
			category: "Bug",
			author: "Lisa Müller",
			id: "4",
		},
		{
			title: "Fazit",
			timecode: "00:08:20",
			description: "Zusammenfassung der wichtigsten Erkenntnisse am Ende des Videos.",
			category: "Allgemein",
			author: "Max Mustermann",
			id: "5",
		},
		{
			title: "Musik einsetzen",
			timecode: "00:06:10",
			description: "Ab hier könnte die Hintergrundmusik etwas lauter werden.",
			category: "Feedback",
			author: "Anna Schmidt",
			id: "6",
		},
	];
</script>

<div>
	<h1 class="text-2xl font-bold">Marker</h1>

	{#each markers as marker (marker.id)}
		<Marker {marker} />
	{/each}
</div>
