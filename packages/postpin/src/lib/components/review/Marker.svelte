<script lang="ts">
	import type { Prisma } from "@postpin-io/shared/db";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import MessageSquareReply from "@lucide/svelte/icons/message-square-reply";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { getResponses } from "./MarkerPanel.remote";
	import Timecode from "./Timecode.svelte";
	import CategoryBadge from "./CategoryBadge.svelte";

	interface Props {
		active?: boolean;
		onselect?: (frame: number) => void;
		onchoose?: () => void;
		ontoggle?: () => void;
		onrange?: () => void;
		/** Called with the new absolute frame when the marker's timecode is edited */
		onreposition?: (frame: number) => void;
		onrespond?: () => void;
		marker: Prisma.MarkerGetPayload<{
			include: {
				author: true;
				category: true;
			};
		}>;
		frameRate: FrameRate;
		startFrame: number;
	}

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
		onrespond,
	}: Props = $props();

	let isOpen = $state(false);
	let responsesCollapsed = $state(false);

	// Responses are only fetched while the marker is expanded
	let responses = $derived(isOpen ? await getResponses(marker.id) : []);

	const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short" });

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

	function handleClick(e: MouseEvent) {
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
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.target === e.currentTarget && e.key === "Enter") {
			e.preventDefault();
			onselect?.(marker.frame);
		}
	}
</script>

{#snippet categoryBadge(classes: string)}
	<CategoryBadge category={marker.category} class={classes} />
{/snippet}

{#snippet checkIcon()}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 20 20"
		fill="currentColor"
		class="h-5 w-5"
		aria-hidden="true"
	>
		<path
			fill-rule="evenodd"
			d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
			clip-rule="evenodd"
		/>
	</svg>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
	class="card mx-1 max-w-full cursor-pointer overflow-hidden border bg-base-100 shadow-sm transition-colors hover:border-primary/60 {active
		? 'border-primary ring-1 ring-primary'
		: 'border-base-300'}"
	role="button"
	tabindex="0"
	aria-pressed={active}
	onclick={handleClick}
	onkeydown={handleKeydown}
>
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
			<div class="card-body gap-3 p-3">
				{#if marker.description}
					<p class="text-xs leading-snug whitespace-pre-wrap text-base-content/75">
						{marker.description}
					</p>
				{/if}

				{#if responses.length > 0}
					<button
						type="button"
						class="flex items-center gap-1 self-start text-xs font-semibold text-base-content/70 hover:text-base-content"
						aria-expanded={!responsesCollapsed}
						onclick={(e) => {
							e.stopPropagation();
							responsesCollapsed = !responsesCollapsed;
						}}
					>
						{#if responsesCollapsed}<ChevronRight size={14} />{:else}<ChevronDown size={14} />{/if}
						Responses ({responses.length})
					</button>
				{/if}
				{#if responses.length > 0 && !responsesCollapsed}
					<ol class="w-full" aria-label="Responses">
						{#each responses as response, index (response.id)}
							{@const isLast = index === responses.length - 1}
							<li class="relative flex w-full gap-3 {isLast ? '' : 'pb-3'}">
								<!-- Connector line to the next response -->
								{#if !isLast}
									<span
										class="absolute top-7 -bottom-2 left-2.5 w-px -translate-x-1/2 bg-base-300"
										aria-hidden="true"
									></span>
								{/if}

								<span class="relative z-10 mt-2 shrink-0 bg-base-100 text-primary">
									{@render checkIcon()}
								</span>

								<div
									class="min-w-0 flex-1 rounded-box border border-base-300 bg-base-200/40 px-3 py-2"
								>
									<p class="text-xs break-words whitespace-pre-wrap">{response.content}</p>
									<div class="mt-1 text-[11px] text-base-content/60">
										{response.author.name} · {dateTimeFormat.format(response.createdAt)}
									</div>
								</div>
							</li>
						{/each}
					</ol>
				{/if}

				<div class="flex justify-end">
					<button
						type="button"
						class="btn btn-outline btn-xs"
						onclick={(e) => {
							e.stopPropagation();
							onrespond?.();
						}}
					>
						<MessageSquareReply size={14} />
						Respond
					</button>
				</div>

				<div
					class="flex items-center justify-between gap-3 border-t border-base-300 pt-2 text-xs text-base-content/60"
				>
					<div class="flex min-w-0 items-center gap-3">
						{#if marker.name?.trim()}
							{@render categoryBadge("badge-sm p-0 px-2")}
						{/if}

						<span class="truncate">By {marker.author.name}</span>

						<span class="font-normal text-base-content/60 tabular-nums">
							{dateFormat.format(marker.createdAt)}
						</span>
					</div>

					<span class="shrink-0 truncate font-mono text-[11px]" title={marker.frame.toString()}>
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
