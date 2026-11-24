<script lang="ts">
	import { reviewShortcutGroups } from "./shortcut-list.ts";

	let { share = false }: { share?: boolean } = $props();

	let dialog = $state<HTMLDialogElement>();

	const groups = $derived(reviewShortcutGroups({ share }));

	export function open() {
		dialog?.showModal();
	}
</script>

<dialog class="modal" bind:this={dialog}>
	<div class="modal-box max-w-2xl">
		<form method="dialog">
			<button class="btn absolute top-2 right-2 btn-circle btn-ghost btn-sm" aria-label="Close">
				✕
			</button>
		</form>
		<h3 class="text-lg font-bold">Keyboard shortcuts</h3>

		<div class="mt-4 grid gap-6 sm:grid-cols-2">
			{#each groups as group (group.title)}
				<section>
					<h4 class="mb-2 text-xs font-semibold tracking-wide text-base-content/60 uppercase">
						{group.title}
					</h4>
					<ul class="flex flex-col gap-1.5 text-sm">
						{#each group.shortcuts as shortcut (shortcut.label)}
							<li class="flex items-center justify-between gap-4">
								<span>{shortcut.label}</span>
								<span class="flex shrink-0 items-center gap-1">
									{#each shortcut.keys as combo, i (i)}
										{#if i > 0}<span class="text-xs text-base-content/40">/</span>{/if}
										<span class="flex gap-0.5">
											{#each combo as key (key)}<kbd class="kbd kbd-sm">{key}</kbd>{/each}
										</span>
									{/each}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Close">close</button>
	</form>
</dialog>
