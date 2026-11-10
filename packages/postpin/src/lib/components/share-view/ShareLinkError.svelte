<script lang="ts">
	interface Props {
		/** HTTP status of the failed share-link request */
		status: number | undefined;
	}
	let { status }: Props = $props();

	const gone = $derived(status === 410);
	const tooMany = $derived(status === 429);
</script>

<div class="flex min-h-full items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-sm bg-base-100 shadow">
		<div class="card-body text-center">
			<h1 class="card-title justify-center">
				{gone ? "This link is no longer active" : tooMany ? "Too many visitors" : "Link not found"}
			</h1>
			<p class="text-sm text-base-content/70">
				{gone || tooMany
					? "Ask the person who shared it with you for a new link."
					: "Check the address, or ask for a new link."}
			</p>
		</div>
	</div>
</div>
