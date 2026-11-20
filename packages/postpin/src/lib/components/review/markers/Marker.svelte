<script lang="ts">
	import { commandKeyLabel, hasCommandKey } from "#lib/keyboard.ts";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";
	import MessageSquareReply from "@lucide/svelte/icons/message-square-reply";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import Locate from "@lucide/svelte/icons/locate";
	import UserRound from "@lucide/svelte/icons/user-round";
	import RangeEdgeIcon from "../RangeEdgeIcon.svelte";
	import { markerDateFormat, markerDateTimeFormat } from "./marker-list.ts";
	import { getResponses } from "./markers.remote";
	import Timecode from "../Timecode.svelte";
	import CategoryBadge from "../../categories/CategoryBadge.svelte";
	import type { ReviewMarker } from "./types";
	import Pencil from "@lucide/svelte/icons/pencil";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import { lastFrameOf } from "@postpin-io/shared/logic/ranges";

	interface Props {
		active?: boolean;
		/** Cut with ⌘X, waiting to be pasted elsewhere */
		cut?: boolean;
		/** Description, responses and details are shown */
		expanded?: boolean;
		onexpand?: (expanded: boolean) => void;
		/** The playhead is inside this range */
		playing?: boolean;
		onselect?: (frame: number) => void;
		onchoose?: () => void;
		ontoggle?: () => void;
		onrange?: () => void;
		/** Called with the new absolute frame when the marker's timecode is edited */
		onreposition?: (frame: number) => void;
		/** Called with the new duration when the range's out timecode is edited */
		onresize?: (duration: number) => void;
		onrespond?: () => void;
		marker: ReviewMarker;
		frameRate: FrameRate;
		startFrame: number;
		/** Timeline length in frames */
		frameCount: number;
		/** Phones: a flat row with an edit button instead of the expandable card */
		mobile?: boolean;
		/** Phones: opens the marker modal */
		onedit?: () => void;
	}

	let {
		marker,
		active = false,
		cut = false,
		expanded = false,
		onexpand,
		playing = false,
		onselect,
		frameRate,
		startFrame,
		frameCount,
		onchoose,
		ontoggle,
		onrange,
		onreposition,
		onresize,
		onrespond,
		mobile = false,
		onedit,
	}: Props = $props();

	import { useShare } from "../share-context.ts";
	const getShare = useShare();
	const share = $derived(getShare());

	let responsesCollapsed = $state(false);

	// Only fetched while expanded and when there are any; never for guests.
	// Not awaited: expanding a marker must not suspend the whole list
	const responsesQuery = $derived(
		expanded && !share && marker.responses.length > 0 ? getResponses(marker.id) : null,
	);
	const responses = $derived(responsesQuery?.current ?? []);

	// A range shows one end at a time; the icon in front switches between in and out
	let showOut = $state(false);

	// Shared with the search, so a date typed as shown here is found
	const dateTimeFormat = markerDateTimeFormat;
	const dateFormat = markerDateFormat;
	// Narrow cards: just the year, the full date stays in the tooltip
	const yearFormat = new Intl.DateTimeFormat(undefined, { year: "numeric" });

	// Phones: the author as initials ("Laurenz Jänsch" → "LJ", "Laurenz" → "LA"), full name as tooltip
	const authorName = $derived(marker.guest?.name ?? marker.author?.name ?? "Deleted User");
	const authorInitials = $derived.by(() => {
		const parts = authorName.trim().split(/\s+/);
		const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
		return letters.toUpperCase();
	});

	function handleClick(e: MouseEvent) {
		if (e.shiftKey) {
			e.preventDefault();
			onrange?.();
		} else if (hasCommandKey(e)) {
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

	// Shift/cmd-clicks select markers and double clicks expand them, neither selects text
	function handleMousedown(e: MouseEvent) {
		if (e.shiftKey || hasCommandKey(e) || e.detail > 1) e.preventDefault();
	}

	// The first click already selected it; a double click opens or closes it
	function handleDblclick(e: MouseEvent) {
		if (e.shiftKey || hasCommandKey(e) || e.altKey) return;
		onexpand?.(!expanded);
	}

	function handleKeydown(e: KeyboardEvent) {
		// Space stays with the player (play/pause), so one can keep watching while picking markers
		if (e.target === e.currentTarget && e.key === "Enter") {
			e.preventDefault();
			onexpand?.(!expanded);
		}
	}
</script>

{#snippet categoryBadge(classes: string)}
	<CategoryBadge category={marker.category} class={classes} />
{/snippet}

{#if mobile}
	<!-- Tap the row to jump there, the pencil to edit and respond -->
	<article
		class="mx-1 flex items-center rounded-box border border-l-4 bg-base-100 shadow-sm {active
			? 'border-primary ring-1 ring-primary'
			: playing
				? 'border-base-content/40'
				: 'border-base-300'}"
		style:border-left-color={marker.category.color}
	>
		<button
			type="button"
			class="flex min-w-0 flex-1 flex-col items-start gap-1 px-3 py-3 text-left"
			onclick={() => {
				onchoose?.();
				onselect?.(marker.frame);
			}}
		>
			{#if marker.name?.trim()}
				<span class="w-full truncate font-semibold">{marker.name}</span>
			{:else}
				{@render categoryBadge("badge-md px-3 font-semibold")}
			{/if}
		</button>

		<div class="flex shrink-0 items-center gap-2 pr-1 text-xs font-medium text-base-content/70">
			<span title={authorName}>{authorInitials}</span>
			{#if marker.responses.length}
				<span class="flex items-center gap-0.5">
					<MessageSquare size={11} />{marker.responses.length}
				</span>
			{/if}
		</div>

		<button
			type="button"
			class="btn btn-square btn-ghost btn-lg"
			aria-label="Edit marker"
			onclick={() => onedit?.()}
		>
			<Pencil size={20} />
		</button>
	</article>
{:else}
	<!-- A click selects the marker; the chevron (or Enter) expands it -->
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<article
		class="mx-1 max-w-full cursor-pointer overflow-hidden rounded-box border border-l-4 bg-base-100 shadow-sm transition-[color,border-color,opacity] hover:border-primary/60 {cut
			? 'opacity-50'
			: ''} {active
			? 'border-primary ring-1 ring-primary'
			: playing
				? 'border-base-content/40'
				: 'border-base-300'}"
		style:border-left-color={marker.category.color}
		data-marker-id={marker.id}
		role="button"
		tabindex="0"
		aria-pressed={active}
		title={cut ? `Cut – paste with ${commandKeyLabel()}V, Esc to cancel` : undefined}
		onclick={handleClick}
		ondblclick={handleDblclick}
		onmousedown={handleMousedown}
		onkeydown={handleKeydown}
	>
		<!-- items-start: with a title over several lines the buttons stay at the top -->
		<div class="flex items-start gap-1 py-1.5 pr-1.5 pl-3 font-semibold">
			<div class="flex min-h-8 min-w-0 flex-1 items-center">
				{#if marker.name?.trim()}
					<!-- anywhere: a long word without spaces wraps too, instead of pushing the buttons out -->
					<div class="text-xs {expanded ? '[overflow-wrap:anywhere]' : 'max-w-xs truncate'}">
						{marker.name}
					</div>
				{:else}
					{@render categoryBadge("badge-md px-3 font-semibold")}
				{/if}
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title="Press alt + click to jump to marker"
				data-guide={active ? "first-review/jump" : undefined}
				onclick={(e) => {
					e.stopPropagation();
					// Jumping to a marker selects it too, like alt + click on the card
					onchoose?.();
					onselect?.(marker.frame);
				}}
			>
				<Locate size={16} />
			</button>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title={expanded ? "Collapse" : "Expand"}
				aria-label={expanded ? "Collapse marker" : "Expand marker"}
				aria-expanded={expanded}
				data-guide={active && !expanded ? "first-review/expand marker-ranges/expand" : undefined}
				onclick={(e) => {
					e.stopPropagation();
					onexpand?.(!expanded);
				}}
			>
				{#if expanded}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
			</button>
		</div>

		{#if expanded}
			<div class="flex flex-col gap-3 px-3 pb-3 text-sm">
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

								<span class="relative z-10 mt-2 shrink-0 bg-base-100 text-base-content/60">
									<UserRound size={20} aria-hidden="true" />
								</span>

								<div
									class="min-w-0 flex-1 rounded-box border border-base-300 bg-base-200/40 px-3 py-2"
								>
									<p class="text-xs break-words whitespace-pre-wrap">{response.content}</p>
									<div class="mt-1 text-[11px] text-base-content/60">
										{response.author?.name ?? "Deleted User"} · {dateTimeFormat.format(
											response.createdAt,
										)}
									</div>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
				{#if !share}
					<div class="flex justify-end">
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							data-guide={active ? "first-review/open-responses" : undefined}
							onclick={(e) => {
								e.stopPropagation();
								onrespond?.();
							}}
						>
							<MessageSquareReply size={14} />
							Respond
						</button>
					</div>
				{/if}
				<div
					class="@container flex items-center justify-between gap-3 border-t border-base-300 pt-2 text-xs text-base-content/60"
				>
					<!-- Getting narrower: the author becomes initials first, then the date just the year -->
					<div class="flex min-w-0 items-center gap-3">
						{#if marker.name?.trim()}
							<span class="flex max-w-28 min-w-0 shrink">
								{@render categoryBadge("badge-sm p-0 px-2")}
							</span>
						{/if}

						<span class="truncate @max-md:hidden">By {authorName}</span>
						<span class="shrink-0 @md:hidden" title={authorName}>{authorInitials}</span>

						<span
							class="shrink-0 font-normal text-base-content/60 tabular-nums"
							title={dateTimeFormat.format(marker.createdAt)}
						>
							<span class="@max-xs:hidden">{dateFormat.format(marker.createdAt)}</span>
							<span class="@xs:hidden">{yearFormat.format(marker.createdAt)}</span>
						</span>
					</div>

					<!-- Editing the timecode must not select the marker -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						class="flex shrink-0 items-center gap-1 font-mono text-[11px]"
						onclick={(e) => e.stopPropagation()}
					>
						{#if marker.duration > 0}
							<button
								type="button"
								class="cursor-pointer opacity-80 hover:opacity-100"
								title={showOut
									? "Range end – click to show the start"
									: "Range start – click to show the end"}
								aria-label={showOut ? "Show range start" : "Show range end"}
								data-guide={active && marker.canUpdate ? "marker-ranges/range-end" : undefined}
								onclick={() => (showOut = !showOut)}
							>
								<!-- The same half diamonds as on the timeline -->
								<RangeEdgeIcon
									edge={showOut ? "end" : "start"}
									size={12}
									fill={marker.category.color}
									strokeWidth={0}
								/>
							</button>
						{/if}
						{#if showOut && marker.duration > 0}
							<Timecode
								bind:frame={
									() => lastFrameOf(marker),
									(end) => onresize?.(Math.max(end - marker.frame + 1, 1))
								}
								{frameRate}
								{startFrame}
								{frameCount}
								editable={marker.canUpdate}
							/>
						{:else}
							<Timecode
								bind:frame={() => marker.frame, (f) => onreposition?.(f)}
								guide={active && marker.canUpdate ? "marker-ranges/timecode" : undefined}
								{frameRate}
								{startFrame}
								{frameCount}
								editable={marker.canUpdate}
							/>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</article>
{/if}
