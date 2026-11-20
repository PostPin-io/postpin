<script lang="ts">
	// The sharing tour: opened with the Share Guide button, as a dialog, because share links
	// and invite links are best understood next to each other.
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Link from "@lucide/svelte/icons/link";
	import ShareArrow from "#lib/components/icons/ShareArrow.svelte";
	import UserGroup from "@lucide/svelte/icons/user-group";
	import X from "@lucide/svelte/icons/x";
	import { reviewTour } from "./review-tour.svelte.ts";

	interface Props {
		/** What the breadcrumbs of this page say */
		names: { project: string; timeline: string; export: string };
		/** "Got it": the tour was read, the Share Guide button has done its job (the two below end it too) */
		ondone: () => void;
		onsharelink: () => void;
		oninvitelink: () => void;
	}
	let { names, ondone, onsharelink, oninvitelink }: Props = $props();

	let page = $state<1 | 2>(1);

	let dialog: HTMLDialogElement | null = $state(null);

	$effect(() => {
		if (reviewTour.shareOpen) {
			page = 1;
			dialog?.showModal();
		} else dialog?.close();
	});

	// the sharing dialog is a modal too: this one makes room for it
	function leaveFor(open: () => void) {
		reviewTour.shareOpen = false;
		open();
	}
</script>

<dialog
	class="modal modal-bottom sm:modal-middle"
	bind:this={dialog}
	onclose={() => (reviewTour.shareOpen = false)}
>
	<div class="modal-box max-h-[90dvh] sm:max-w-3xl">
		<div class="flex items-start gap-2">
			<div class="min-w-0 flex-1">
				<h3 class="text-xl font-bold">Share your export</h3>
				<p class="text-sm text-base-content/70">There are two ways to let others in.</p>
			</div>
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				title="Close"
				aria-label="Close"
				onclick={() => dialog?.close()}
			>
				<X size={16} />
			</button>
		</div>

		{#if page === 1}
			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				<section class="flex flex-col gap-3 rounded-box border border-base-300 p-4">
					<h4 class="flex items-center gap-2 text-lg font-bold">
						<Link class="size-5 shrink-0 text-primary" />
						Share links
					</h4>
					<p class="text-sm text-base-content/80">
						Anyone with a share link can watch this export and leave notes, without an account.
						Perfect for clients.
					</p>
				</section>

				<section class="flex flex-col gap-3 rounded-box border border-base-300 p-4">
					<h4 class="flex items-center gap-2 text-lg font-bold">
						<UserGroup class="size-5 shrink-0 text-primary" />
						Invite links
					</h4>
					<p class="text-sm text-base-content/80">
						Anyone of your crew who joins with an invite link gets an account and stays on the team.
						You can limit them to single projects or timelines.
					</p>
				</section>
			</div>

			<div class="modal-action">
				<button type="button" class="btn btn-primary" onclick={() => (page = 2)}>Next</button>
			</div>
		{:else}
			<p class="mt-4 text-sm text-base-content/80">
				Both are created with the buttons at the top of the page.
			</p>

			<!-- The breadcrumbs as they look in the header, not clickable -->
			<div
				class="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-box bg-base-200 p-4 text-sm"
				aria-hidden="true"
			>
				<ChevronRight class="size-3.5 text-base-content/50" />
				<span class="max-w-32 truncate">{names.project}</span>
				<span class="rounded-field bg-primary p-1 text-primary-content">
					<UserGroup class="size-3.5" />
				</span>
				<ChevronRight class="size-3.5 text-base-content/50" />
				<span class="max-w-32 truncate">{names.timeline}</span>
				<span class="rounded-field bg-primary p-1 text-primary-content">
					<UserGroup class="size-3.5" />
				</span>
				<ChevronRight class="size-3.5 text-base-content/50" />
				<span class="max-w-32 truncate">{names.export}</span>
				<span
					class="ml-auto flex items-center gap-1 rounded-field bg-primary px-2 py-1 text-primary-content"
				>
					<ShareArrow class="size-3.5" />
					Share
				</span>
			</div>

			<ul class="mt-4 space-y-2 text-sm text-base-content/80">
				<li class="flex gap-2">
					<ShareArrow class="mt-0.5 size-4 shrink-0 text-base-content" />
					<span>Share, at the right end: the export's share links.</span>
				</li>
				<li class="flex gap-2">
					<UserGroup class="mt-0.5 size-4 shrink-0 text-base-content" />
					<span>next to a project or timeline: invitations and invite links for it.</span>
				</li>
			</ul>

			<div class="modal-action flex-wrap">
				<button type="button" class="btn btn-ghost" onclick={() => (page = 1)}>Back</button>
				<span class="flex-1"></span>
				<button type="button" class="btn" onclick={() => leaveFor(onsharelink)}>
					<Link size={16} />
					Create a share link
				</button>
				<button type="button" class="btn" onclick={() => leaveFor(oninvitelink)}>
					<UserGroup size={16} />
					Show invite links
				</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={() => {
						dialog?.close();
						ondone();
					}}
				>
					Got it
				</button>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
