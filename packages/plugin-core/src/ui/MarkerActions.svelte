<script lang="ts">
	interface Props {
		disabled: boolean;
		onSyncUp: () => void;
		onSyncDown: () => void;
		onDelete: () => void;
	}

	let { disabled, onSyncUp, onSyncDown, onDelete }: Props = $props();
</script>

<div class="flex justify-between gap-2">
	<button onclick={onSyncUp} {disabled} class="btn btn-secondary">Sync Markers Up</button>
	<button onclick={onSyncDown} {disabled} class="btn btn-secondary">Sync Markers Down</button>
	<button onclick={onDelete} {disabled} class="btn btn-error">Delete All Markers</button>
</div>
