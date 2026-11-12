<script lang="ts">
	import Info from "@lucide/svelte/icons/info";
	import { GUEST_CATEGORY_REASONS } from "./guest-category.ts";

	let { id }: { id: string } = $props();
</script>

<button
	type="button"
	class="btn btn-square btn-ghost btn-sm"
	popovertarget="guest-category-info-{id}"
	style="anchor-name: --guest-category-info-{id}"
	aria-label="Why can't the guest category be deleted or renamed?"
>
	<Info class="size-[1.1em]" />
</button>

<div
	id="guest-category-info-{id}"
	popover
	class="dropdown z-50 max-h-none w-72 overflow-visible rounded-box bg-base-100 p-3 text-sm shadow-lg"
	style="position-anchor: --guest-category-info-{id}"
>
	<p class="font-semibold">Guest category</p>
	<ul class="mt-1 list-disc space-y-1 pl-4 text-base-content/70">
		{#each GUEST_CATEGORY_REASONS as reason (reason)}
			<li>{reason}</li>
		{/each}
	</ul>
</div>
