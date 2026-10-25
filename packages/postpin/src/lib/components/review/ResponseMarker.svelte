<script lang="ts">
	import type { Prisma } from "@postpin-io/shared/db";
	import { createResponse } from "./MarkerPanel.remote";
	import CategoryBadge from "./CategoryBadge.svelte";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Send from "@lucide/svelte/icons/send";

	interface Props {
		onclose?: () => void;
		marker: Prisma.MarkerGetPayload<{
			include: {
				author: true;
				category: true;
			};
		}>;
	}
	let { marker, onclose }: Props = $props();

	let content = $state("");
	let sending = $state(false);
	let textarea: HTMLTextAreaElement | null = null;

	export function focusInput() {
		textarea?.focus();
	}

	async function send() {
		const text = content.trim();
		if (!text || sending) return;
		sending = true;
		try {
			await createResponse({ markerId: marker.id, content: text });
			content = "";
		} finally {
			sending = false;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void send();
		}
	}
</script>

<section class="card mx-1 h-full border border-base-300 bg-base-200 shadow-sm">
	<div class="card-body h-full min-h-0 gap-3 p-4">
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="btn btn-square btn-ghost"
				title="Back to editor"
				aria-label="Back to marker editor"
				onclick={() => onclose?.()}
			>
				<ArrowLeft size={20} />
			</button>
			<h2 class="card-title text-base">Responses</h2>
			<CategoryBadge category={marker.category} class="badge-sm" />
		</div>

		<form
			class="flex flex-col gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<textarea
				bind:this={textarea}
				class="textarea w-full resize-none"
				rows="3"
				placeholder="Write a response…"
				bind:value={content}
				{onkeydown}></textarea>
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs text-base-content/60">⌘/Ctrl + Enter to send</span>
				<button type="submit" class="btn btn-primary btn-sm" disabled={sending || !content.trim()}>
					{#if sending}<span class="loading loading-xs loading-spinner"></span>{:else}<Send
							size={16}
						/>{/if}
				</button>
			</div>
		</form>
	</div>
</section>
