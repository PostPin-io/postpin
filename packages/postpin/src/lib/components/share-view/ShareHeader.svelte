<script lang="ts">
	import StickyNote from "@lucide/svelte/icons/sticky-note";
	import Logo from "#lib/components/layout/Logo.svelte";

	interface Props {
		exportName: string;
		guestName: string;
		hasNote: boolean;
		noteVisible?: boolean;
	}
	let { exportName, guestName, hasNote, noteVisible = $bindable(false) }: Props = $props();
</script>

<header class="navbar min-h-12 gap-3 border-b border-base-300 bg-base-100 px-3">
	<Logo class="size-6 shrink-0" />
	<h1 class="min-w-0 flex-1 truncate font-semibold">{exportName}</h1>
	{#if hasNote}
		<button
			class="btn btn-ghost btn-sm"
			aria-label="Note"
			class:btn-active={noteVisible}
			aria-pressed={noteVisible}
			onclick={() => (noteVisible = !noteVisible)}
		>
			<StickyNote size={16} /> <span class="max-sm:hidden">Note</span>
		</button>
	{/if}
	<span class="hidden text-sm text-base-content/60 sm:inline">{guestName}</span>
</header>
