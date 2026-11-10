<script lang="ts">
	import { MAX_RECIPIENTS_PER_SEND, parseEmailList } from "@postpin-io/shared/logic/share-links";
	import { sendShareLink } from "./share-links.remote";

	interface Props {
		linkId: string;
		onclose: () => void;
	}
	let { linkId, onclose }: Props = $props();

	let text = $state("");
	let sending = $state(false);
	let problem = $state<string | null>(null);
	let result = $state<{ sent: number; failed: string[] } | null>(null);

	const parsed = $derived(parseEmailList(text));
	const tooMany = $derived(parsed.valid.length > MAX_RECIPIENTS_PER_SEND);
	const canSend = $derived(
		!sending && parsed.valid.length > 0 && parsed.invalid.length === 0 && !tooMany,
	);

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (!canSend) return;
		sending = true;
		problem = null;
		try {
			result = await sendShareLink({ id: linkId, emails: parsed.valid });
			if (result.failed.length === 0) text = "";
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			sending = false;
		}
	}
</script>

<form class="mt-2 flex flex-col gap-2" onsubmit={send}>
	<label class="flex flex-col gap-1 text-sm">
		<span>Send to</span>
		<textarea
			class="textarea w-full textarea-sm"
			rows="2"
			placeholder="anna@example.com, ben@example.com"
			bind:value={text}
			disabled={sending}></textarea>
	</label>

	<p class="text-xs text-base-content/60">
		{#if parsed.invalid.length > 0}
			<span class="text-error">Not an e-mail address: {parsed.invalid.join(", ")}</span>
		{:else if tooMany}
			<span class="text-error">At most {MAX_RECIPIENTS_PER_SEND} recipients at once.</span>
		{:else if parsed.valid.length > 0}
			{parsed.valid.length} recipient{parsed.valid.length === 1 ? "" : "s"}. Each gets their own
			mail with the link and the note.
		{:else}
			Separate addresses with commas, spaces or line breaks.
		{/if}
	</p>

	{#if problem}<p class="text-sm text-error">{problem}</p>{/if}
	{#if result}
		<p class="text-sm {result.failed.length ? 'text-warning' : 'text-success'}">
			Sent to {result.sent} recipient{result.sent === 1 ? "" : "s"}.
			{#if result.failed.length}Could not send to {result.failed.join(", ")}.{/if}
		</p>
	{/if}

	<div class="flex justify-end gap-2">
		<button type="button" class="btn btn-ghost btn-sm" onclick={onclose} disabled={sending}>
			Close
		</button>
		<button class="btn btn-primary btn-sm" disabled={!canSend}>
			Send
			{#if sending}<span class="loading loading-xs loading-spinner"></span>{/if}
		</button>
	</div>
</form>
