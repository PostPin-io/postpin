<script lang="ts">
	import type { Prisma } from "@postpin-io/shared/db";
	import Timecode from "./Timecode.svelte";
	import type { FrameRate } from "@postpin-io/shared/types/TimelineSnapshot";

	let { marker, active = false, onselect, frameRate, startFrame, onchoose }: Props = $props();

	interface Props {
		active?: boolean;
		onselect?: (frame: number) => void;
		onchoose?: () => void;
		marker: Prisma.MarkerGetPayload<{
			include: {
				author: true;
				category: true;
			};
		}>;
		frameRate: FrameRate;
		startFrame: number;
	}

	// Pick black or white text depending on the perceived brightness of the category color
	function textColor(hex: string) {
		const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
		if (!m) return undefined;
		const n = parseInt(m[1], 16);
		const luminance = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
		return luminance > 150 ? "#000000" : "#ffffff";
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
	class="card mx-1 max-w-full cursor-pointer overflow-hidden border bg-base-100 shadow-sm transition-colors hover:border-primary/60 {active
		? 'border-primary ring-1 ring-primary'
		: 'border-base-300'}"
	role="button"
	tabindex="0"
	aria-pressed={active}
	onclick={(e) => {
		onchoose?.();
		if (e.metaKey) {
			onselect?.(marker.frame);
		}
	}}
	onkeydown={(e) => {
		if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onselect?.(marker.frame);
		}
	}}
>
	<details
		class=" group collapse-arrow collapse border border-l-4 border-base-300 bg-base-100"
		style:border-left-color={marker.category.color}
	>
		<summary class="collapse-title font-semibold">
			<div class="max-w-xs truncate group-open:max-w-none group-open:whitespace-normal">
				{marker.name || "Untitled marker"}
			</div>
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
						<span
							class="badge badge-outline p-0 px-2 badge-sm"
							style:background-color={marker.category.color}
							style:border-color={marker.category.color}
							style:color={textColor(marker.category.color)}
						>
							{marker.category.name}
						</span>

						<span>By {marker.author.name}</span>

						<div class="flex items-center justify-between gap-3">
							<span class="text-s font-normal text-base-content/60 tabular-nums">
								{marker.createdAt.getDate()}/{marker.createdAt.getMonth() +
									1}/{marker.createdAt.getFullYear()}
							</span>
						</div>
					</div>

					<span class="truncate font-mono text-[11px]" title={marker.frame.toString()}>
						<Timecode frame={marker.frame} {frameRate} {startFrame} />
					</span>
				</div>
			</div>
		</div>
	</details>
</article>
