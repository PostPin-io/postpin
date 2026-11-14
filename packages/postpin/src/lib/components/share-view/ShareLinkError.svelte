<script lang="ts">
	import LegalLinks from "#lib/components/layout/LegalLinks.svelte";

	interface Props {
		/** HTTP status of the failed share-link request */
		status: number | undefined;
		/** A screening link: "full" means its guest limit, set by the presenter */
		screening?: boolean;
	}
	let { status, screening = false }: Props = $props();

	const gone = $derived(status === 410);
	const tooMany = $derived(status === 429);
</script>

<div class="flex min-h-full items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-sm bg-base-100 shadow">
		<div class="card-body text-center">
			<h1 class="card-title justify-center">
				{gone
					? "This link is no longer active"
					: tooMany
						? screening
							? "This screening is full"
							: "Too many visitors"
						: "Link not found"}
			</h1>
			<p class="text-sm text-base-content/70">
				{tooMany && screening
					? "All places for guests are taken. Ask the presenter to raise the limit."
					: gone || tooMany
						? "Ask the person who shared it with you for a new link."
						: "Check the address, or ask for a new link."}
			</p>
			<LegalLinks class="mt-2 text-xs text-base-content/60" />
		</div>
	</div>
</div>
