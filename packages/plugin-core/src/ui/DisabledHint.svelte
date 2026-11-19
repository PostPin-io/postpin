<script lang="ts">
	import Info from "@lucide/svelte/icons/info";

	interface Props {
		// why the action next to it can't run yet
		text: string;
	}

	let { text }: Props = $props();
</script>

<p
	role="status"
	class="alert max-w-56 alert-soft alert-warning items-start gap-2 px-3 py-2 text-xs"
>
	<Info class="size-4 shrink-0" aria-hidden="true" />
	<span>{text}</span>
</p>
