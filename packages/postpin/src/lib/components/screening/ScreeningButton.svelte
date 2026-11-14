<script lang="ts">
	import { page } from "$app/state";
	import Projector from "@lucide/svelte/icons/projector";
	import { authClient } from "#lib/auth-client.ts";
	import { roleAllows, toRole } from "#lib/roles.ts";
	import {
		createScreeningLink,
		getScreeningSetup,
		resumeScreeningLink,
	} from "#lib/components/sharing/share-links/share-links.remote.ts";
	import { formatExpiry, shareLinkUrl } from "#lib/components/sharing/share-links/share-links.ts";
	import {
		openScreeningWindow,
		requestStopScreening,
		screening,
		startScreening,
		type ScreeningIds,
	} from "./screening.svelte.ts";

	interface Props {
		ids: ScreeningIds;
		/** The video can be streamed; before that there is nothing to screen */
		ready: boolean;
	}
	let { ids, ready }: Props = $props();

	// Starts and ends a screening of this export. In the header, so desktop only: a phone has no
	// second screen to move the window to.

	const activeMember = authClient.useActiveMember();
	const role = $derived(toRole($activeMember.data?.role));
	// A screening needs a share link: same rights (members and above)
	const mayScreen = $derived(role ? roleAllows(role, "shareLink", "create") : false);

	const running = $derived(screening.session?.exportId === ids.exportId);

	let dialog = $state<HTMLDialogElement>();
	let open = $state(false);
	const setup = $derived(open ? getScreeningSetup(ids.exportId) : undefined);
	const existing = $derived(setup?.current?.existing ?? null);
	/** With a screening link still active: carry on with it, or start a new screening */
	let choice = $state<"existing" | "new">("existing");
	const continuing = $derived(!!existing && choice === "existing");

	let maxGuests = $state<number | null>(null);
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let notice = $state<string | null>(null);

	// Whoever joined already stays: the limit of their link can't go below them
	const minGuests = $derived(continuing ? Math.max(1, existing!.guestCount) : 1);
	function suggestedLimit() {
		const current = setup?.current;
		if (!current) return null;
		return continuing
			? Math.max(existing!.maxGuests ?? current.defaultMaxGuests, existing!.guestCount)
			: current.defaultMaxGuests;
	}
	// Once per opening: afterwards the field is the user's, also when they empty it to retype
	let prefilled = false;
	$effect(() => {
		if (!setup?.current || prefilled) return;
		prefilled = true;
		maxGuests = suggestedLimit();
	});
	const valid = $derived(
		!!setup?.current &&
			maxGuests !== null &&
			Number.isInteger(maxGuests) &&
			maxGuests >= minGuests &&
			maxGuests <= setup.current.maxGuestsLimit,
	);

	function choose(next: "existing" | "new") {
		choice = next;
		maxGuests = suggestedLimit();
	}

	function toggle() {
		if (running) return requestStopScreening();
		problem = null;
		maxGuests = null;
		prefilled = false;
		choice = "existing";
		// guests may have joined, or the link expired, since the dialog was last open
		if (setup === undefined) void getScreeningSetup(ids.exportId).refresh();
		open = true;
		dialog?.showModal();
	}

	async function start() {
		if (!valid || maxGuests === null) return;
		// First thing in the click, before any await: otherwise the browser blocks the pop-up
		const win = openScreeningWindow(ids);
		if (!win) {
			problem =
				"Your browser blocked the screening window. Allow pop-ups for this site and try again.";
			return;
		}
		busy = true;
		problem = null;
		try {
			const link = continuing
				? await resumeScreeningLink({ id: existing!.id, maxGuests })
				: await createScreeningLink({
						exportId: ids.exportId,
						maxGuests,
						// for the date in the name of the screening's category
						timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					});
			startScreening(win, link, shareLinkUrl(page.url.origin, link.token));
			notice = continuing
				? "Screening continued with the existing screening link."
				: "Screening link created. It works for 24 hours; you find it in the share links.";
			setTimeout(() => (notice = null), 6000);
			dialog?.close();
		} catch (e) {
			win.popup?.close();
			problem = (e as Error).message || "The screening could not be started.";
		} finally {
			busy = false;
		}
	}
</script>

{#if mayScreen}
	<button
		class="btn btn-square {running ? 'btn-error' : 'btn-ghost'}"
		title={running
			? "End screening"
			: ready
				? "Start a screening"
				: "Screening: the video is still processing"}
		aria-label={running ? "End screening" : "Start a screening"}
		aria-pressed={running}
		disabled={!ready && !running}
		onclick={toggle}
	>
		<span class="relative">
			<Projector size={20} />
			{#if running}
				<span class="absolute -top-1.5 -right-1.5 size-2 animate-pulse rounded-full bg-white"
				></span>
			{/if}
		</span>
	</button>

	<dialog class="modal" bind:this={dialog} onclose={() => (open = false)}>
		<div class="modal-box">
			<h3 class="flex items-center gap-2 text-lg font-bold"><Projector size={20} /> Screening</h3>
			<p class="mt-2 text-sm text-base-content/70">Review this export live with an audience.</p>
			<details class="mt-2 text-sm">
				<summary class="cursor-pointer text-base-content/70 hover:text-base-content">
					How does a screening work?
				</summary>
				<ol class="mt-2 list-decimal space-y-1.5 pl-5">
					<li>
						The video opens in its own window. Move it to the projector or external screen and go
						fullscreen.
					</li>
					<li>
						A QR code shows before the video starts. Your guests scan it and leave their markers
						from their phones (muted, with a small video to navigate).
					</li>
					<li>You control playback from this page, and end the screening with the same button.</li>
				</ol>
			</details>

			{#if setup?.error}
				<p class="mt-4 text-sm text-error">Could not prepare the screening.</p>
			{:else if !setup?.current}
				<span class="loading mt-4 loading-spinner"></span>
			{:else}
				{#if existing}
					<p class="mt-4 text-sm">A screening link for this export is still active.</p>
					<div class="mt-2 grid gap-2">
						<label
							class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3 has-checked:border-primary"
						>
							<input
								type="radio"
								class="radio mt-0.5 radio-sm"
								name="screening-choice"
								checked={choice === "existing"}
								disabled={busy}
								onchange={() => choose("existing")}
							/>
							<span class="text-sm">
								<strong>Continue the existing screening</strong>
								<span class="block text-base-content/70">
									Started {existing.createdAt.toLocaleString(undefined, {
										dateStyle: "medium",
										timeStyle: "short",
									})} · {existing.guestCount} guest{existing.guestCount === 1 ? "" : "s"} ·
									{formatExpiry(existing.expiresAt).toLowerCase()}{existing.categoryName
										? ` · markers in "${existing.categoryName}"`
										: ""}
								</span>
							</span>
						</label>
						<label
							class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3 has-checked:border-primary"
						>
							<input
								type="radio"
								class="radio mt-0.5 radio-sm"
								name="screening-choice"
								checked={choice === "new"}
								disabled={busy}
								onchange={() => choose("new")}
							/>
							<span class="text-sm">
								<strong>New screening</strong>
								<span class="block text-base-content/70">
									A new link and a new category for its markers. The existing link stays active.
								</span>
							</span>
						</label>
					</div>
				{:else}
					<p class="mt-4 text-sm text-base-content/70">
						This creates a share link for the screening: markers only, valid for 24 hours. The
						guests' markers get their own category, named after today's date.
					</p>
				{/if}
				<label class="mt-3 flex items-center gap-3 text-sm">
					<span class="flex-1">
						Guest limit
						<span class="text-base-content/60">(up to {setup.current.maxGuestsLimit})</span>
					</span>
					<input
						type="number"
						class="input w-24 input-sm"
						min={minGuests}
						max={setup.current.maxGuestsLimit}
						step="1"
						required
						disabled={busy}
						bind:value={maxGuests}
					/>
				</label>
			{/if}

			{#if problem}<p role="alert" class="mt-3 text-sm text-error">{problem}</p>{/if}

			<div class="modal-action">
				<button class="btn" disabled={busy} onclick={() => dialog?.close()}>Cancel</button>
				<button class="btn btn-primary" disabled={busy || !valid} onclick={start}>
					{continuing ? "Continue screening" : "Create screening link"}
					{#if busy}<span class="loading loading-xs loading-spinner"></span>{/if}
				</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop"><button>close</button></form>
	</dialog>

	{#if notice}
		<div class="toast toast-center toast-top z-50">
			<div role="status" class="alert text-sm alert-success">{notice}</div>
		</div>
	{/if}
{/if}
