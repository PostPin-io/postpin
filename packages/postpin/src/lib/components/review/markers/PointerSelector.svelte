<script lang="ts">
	import PointerIcon from "./PointerIcon.svelte";
	import MoveUpLeft from "@lucide/svelte/icons/move-up-left";
	import Square from "@lucide/svelte/icons/square";
	import Trash from "@lucide/svelte/icons/trash";
	import Check from "@lucide/svelte/icons/check";
	import {
		MAX_POINTERS_PER_MARKER,
		POINTER_COLORS,
		type PointerColor,
	} from "@postpin-io/shared/logic/pointers";
	import { isInsideOverlay, isPlainKey, isTypingTarget } from "#lib/keyboard.ts";
	import { usePointerSession } from "./pointer-session.svelte.ts";
	import { contrastColor } from "../../categories/category-color.ts";
	import { changePointer, removePointer, type PointerScope } from "./pointer-actions.ts";
	import type { ReviewMarker } from "./types.ts";

	interface Props {
		marker: ReviewMarker;
		scope: PointerScope;
	}
	let { marker, scope }: Props = $props();

	const session = usePointerSession();
	const editable = $derived(marker.canUpdate);

	// A popover lives in the top layer, so the marker card's scroll container can't clip it
	const uid = $props.id();

	const COLOR_NAMES: Record<PointerColor, string> = {
		"#CE272D": "Flag Red",
		"#146D2D": "Turf Green",
		"#5A68E5": "Electric Sapphire",
		"#11CFE4": "Strong Cyan",
		"#081212": "Onyx",
		"#EEDCF5": "Lavender Veil",
	};

	// Numbered per kind, in the order they were drawn: "Arrow 1", "Box 1", "Arrow 2"
	const rows = $derived.by(() => {
		const counts = { ARROW: 0, RECT: 0 };
		return marker.pointers.map((pointer) => ({
			pointer,
			label: `${pointer.kind === "RECT" ? "Box" : "Arrow"} ${++counts[pointer.kind]}`,
		}));
	});

	function highlight(id: string | null) {
		if (session) session.highlightedId = id;
	}

	// ─── Drawing: the button next to the count, or P ───
	const drawing = $derived(session?.drawingMarkerId === marker.id);
	const full = $derived(marker.pointers.length >= MAX_POINTERS_PER_MARKER);

	function toggleDrawing() {
		if (!session || !editable) return;
		if (drawing) session.stopDrawing();
		else if (!full) session.startDrawing(marker);
	}

	function drawKeypress(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== "p" || !isPlainKey(event) || event.shiftKey) return;
		if (isTypingTarget(event) || isInsideOverlay(event) || event.repeat) return;
		event.preventDefault();
		toggleDrawing();
	}
</script>

<svelte:window onkeydown={drawKeypress} />

<!-- One group: the pointer icon draws, the count next to it opens the list. Without the right to
edit, only the list is left, so it shows the icon itself. -->
<div class="join shrink-0" style:anchor-name="--pointers-{uid}">
	{#if editable}
		<button
			type="button"
			class="btn join-item btn-square"
			class:btn-active={drawing}
			class:text-accent={drawing}
			title={full
				? `A marker has at most ${MAX_POINTERS_PER_MARKER} pointers`
				: "Add a pointer on the picture (P)"}
			aria-label="Add pointer"
			aria-pressed={drawing}
			disabled={full && !drawing}
			data-pointer-ui
			onclick={toggleDrawing}
		>
			<PointerIcon size={20} />
		</button>
	{/if}
	{#if marker.pointers.length > 0}
		<button
			type="button"
			popovertarget="pointers-{uid}"
			class="btn join-item gap-1.5 px-3 tabular-nums"
			title="Pointers"
			aria-label="Pointers: {marker.pointers.length}"
			data-pointer-ui
		>
			{#if !editable}<PointerIcon size={18} />{/if}
			{marker.pointers.length}
		</button>
	{/if}
</div>
<div
	id="pointers-{uid}"
	popover="auto"
	style:position-anchor="--pointers-{uid}"
	class="pointer-popover m-0 w-80 max-w-[calc(100vw-1rem)] rounded-box bg-base-100 p-0 text-base-content shadow"
	data-pointer-ui
	ontoggle={(event) => {
		if ((event as ToggleEvent).newState === "closed") highlight(null);
	}}
>
	<ul class="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
		{#each rows as { pointer, label } (pointer.id)}
			<li
				class="flex items-center gap-2 rounded-field px-1 py-1 hover:bg-base-200"
				class:bg-base-200={session?.selectedId === pointer.id}
				onmouseenter={() => highlight(pointer.id)}
				onmouseleave={() => highlight(null)}
			>
				<button
					type="button"
					class="btn min-w-0 flex-1 justify-start gap-2 btn-ghost px-1 btn-sm"
					title="Show on the picture"
					onclick={() => session?.show(marker, pointer.id)}
				>
					<span
						class="flex size-5 shrink-0 items-center justify-center rounded-sm border border-black/40"
						style:background-color={pointer.color}
						style:color={contrastColor(pointer.color)}
					>
						{#if pointer.kind === "RECT"}<Square size={14} />{:else}<MoveUpLeft size={14} />{/if}
					</span>
					<span class="truncate">{label}</span>
				</button>
				{#if editable}
					<div class="flex shrink-0 gap-0.5" role="radiogroup" aria-label="{label} color">
						{#each POINTER_COLORS as color (color)}
							<button
								type="button"
								role="radio"
								aria-checked={pointer.color === color}
								aria-label={COLOR_NAMES[color]}
								title={COLOR_NAMES[color]}
								class="flex size-4 items-center justify-center rounded-full border border-black/40"
								style:background-color={color}
								onclick={() => void changePointer(scope, marker.id, pointer.id, { color })}
							>
								{#if pointer.color === color}<Check
										size={10}
										color={contrastColor(color)}
										strokeWidth={3}
									/>{/if}
							</button>
						{/each}
					</div>
					<button
						type="button"
						class="btn btn-square btn-ghost text-error btn-xs"
						title="Delete pointer"
						aria-label="Delete {label}"
						onclick={() => {
							highlight(null);
							void removePointer(scope, marker.id, pointer.id);
						}}
					>
						<Trash size={14} />
					</button>
				{/if}
			</li>
		{:else}
			<li class="px-2 text-xs opacity-60">No pointers yet</li>
		{/each}
	</ul>
</div>

<style>
	/* Below the button, left-aligned to it, kept inside the viewport (like the category selector) */
	.pointer-popover {
		position: fixed;
		inset: auto;
		top: anchor(bottom);
		left: anchor(left);
		margin-top: 0.25rem;
		position-try-fallbacks: flip-block, flip-inline;
	}
</style>
