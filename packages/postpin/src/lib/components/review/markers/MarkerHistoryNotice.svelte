<script lang="ts">
	import type { MarkerHistory } from "./marker-history.svelte.ts";

	let { history }: { history: MarkerHistory } = $props();

	let dialog = $state<HTMLDialogElement>();
	$effect(() => {
		if (history.question && !dialog?.open) dialog?.showModal();
		if (!history.question && dialog?.open) dialog.close();
	});
</script>

{#if history.notice}
	{@const notice = history.notice}
	<div class="toast toast-center toast-bottom z-50" role="status" aria-live="polite">
		<div class="alert {notice.tone === 'warning' ? 'alert-warning' : ''} py-2 text-sm shadow">
			<span>
				{notice.text}
				{#if notice.link}
					· on <a class="link" href={notice.link.href}>{notice.link.name}</a>
				{/if}
			</span>
		</div>
	</div>
{/if}

<dialog
	bind:this={dialog}
	class="modal"
	onclose={() => history.question?.answer(false)}
	aria-labelledby="marker-history-question"
>
	<div class="modal-box">
		<p id="marker-history-question">{history.question?.text}</p>
		<div class="modal-action">
			<button type="button" class="btn" onclick={() => history.question?.answer(false)}>
				Cancel
			</button>
			<button type="button" class="btn btn-primary" onclick={() => history.question?.answer(true)}>
				Go ahead
			</button>
		</div>
	</div>
</dialog>
