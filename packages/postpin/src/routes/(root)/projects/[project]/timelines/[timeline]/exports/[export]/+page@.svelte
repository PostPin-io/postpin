<script lang="ts">
	import { page } from "$app/state";
	import ExportReview from "#lib/components/review/ExportReview.svelte";
</script>

<ExportReview
	projectId={page.params.project!}
	timelineId={page.params.timeline!}
	exportId={page.params.export!}
/>
