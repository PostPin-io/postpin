<script lang="ts">
	import type { Prisma } from "@postpin-io/shared/db";
	import Timecode from "./Timecode.svelte";
	import CategoryBadge from "./CategoryBadge.svelte";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

	let {
		marker,
		active = false,
		onselect,
		frameRate,
		startFrame,
		onchoose,
		ontoggle,
		onrange,
		onreposition,
	}: Props = $props();

	// 1. Use $state() for Svelte 5 reactivity
	let isOpen = $state(false);

	// 2. Functions to control the state programmatically
	export function toggleCollapse() {
		isOpen = !isOpen;
	}

	export function open() {
		isOpen = true;
	}

	export function collapse() {
		isOpen = false;
	}

	export function isExpanded() {
		return isOpen;
	}
	interface Props {
		active?: boolean;
		onselect?: (frame: number) => void;
		onchoose?: () => void;
		ontoggle?: () => void;
		onrange?: () => void;
		/** Called with the new absolute frame when the marker's timecode is edited */
		onreposition?: (frame: number) => void;
		marker: Prisma.MarkerGetPayload<{
			include: {
				author: true;
				category: true;
			};
		}>;
		frameRate: FrameRate;
		startFrame: number;
	}
</script>

{#snippet categoryBadge(classes: string)}
	<CategoryBadge category={marker.category} class={classes} />
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
	class="card mx-1 max-w-full cursor-pointer overflow-hidden border bg-base-100 shadow-sm transition-colors hover:border-primary/60 {active
		? 'border-primary ring-1 ring-primary'
		: 'border-base-300'}"
	role="button"
	tabindex="0"
	aria-pressed={active}
	onclick={(e) => {
		if (e.shiftKey) {
			e.preventDefault();
			onrange?.();
		} else if (e.metaKey) {
			// Multi-select instead of expanding the marker
			e.preventDefault();
			ontoggle?.();
		} else if (e.altKey) {
			e.preventDefault();
			onchoose?.();
			onselect?.(marker.frame);
		} else {
			onchoose?.();
		}
	}}
	onkeydown={(e) => {
		if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onselect?.(marker.frame);
		}
	}}
>
	<!-- 3. Bind the open state directly to the <details> element -->
	<details
		class="group collapse-arrow collapse border border-l-4 border-base-300 bg-base-100"
		style:border-left-color={marker.category.color}
		bind:open={isOpen}
	>
		<summary class="collapse-title px-3 py-3 font-semibold">
			{#if marker.name?.trim()}
				<div class="max-w-xs truncate text-xs group-open:max-w-none group-open:whitespace-normal">
					{marker.name}
				</div>
			{:else}
				{@render categoryBadge("badge-md px-3 font-semibold")}
			{/if}
		</summary>
		<div class="collapse-content text-sm">
			<div class="card-body gap-2 p-3">
				<div class="space-y-1">
					<p class="text-xs leading-snug text-base-content/75">{marker.description}</p>
				</div>

				<div
					class="flex items-center justify-between gap-3 border-t border-base-300 pt-2 text-xs text-base-content/60"
				>
					<div class="flex items-center gap-3">
						{#if marker.name?.trim()}
							{@render categoryBadge("badge-sm p-0 px-2")}
						{/if}

						<span>By {marker.author.name}</span>

						<div class="flex items-center justify-between gap-3">
							<span class="text-s font-normal text-base-content/60 tabular-nums">
								{marker.createdAt.getDate()}/{marker.createdAt.getMonth() +
									1}/{marker.createdAt.getFullYear()}
							</span>
						</div>
					</div>

					<span class="truncate font-mono text-[11px]" title={marker.frame.toString()}>
						<Timecode
							bind:frame={() => marker.frame, (f) => onreposition?.(f)}
							{frameRate}
							{startFrame}
							editable={true}
						/>
					</span>
				</div>
			</div>
		</div>
	</details>
</article>
