<script lang="ts">
	import { onMount } from "svelte";
	import AppWindow from "@lucide/svelte/icons/app-window";
	import Check from "@lucide/svelte/icons/check";
	import Copy from "@lucide/svelte/icons/copy";
	import Projector from "@lucide/svelte/icons/projector";
	import Tag from "@lucide/svelte/icons/tag";
	import QrCode from "@lucide/svelte/icons/qr-code";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import Users from "@lucide/svelte/icons/users";
	import QRCode from "qrcode";
	import { screeningExpiresSoon } from "@postpin-io/shared/logic/share-links";
	import { getShareLinks } from "#lib/components/sharing/share-links/share-links.remote.ts";
	import { formatExpiry } from "#lib/components/sharing/share-links/share-links.ts";
	import { requestStopScreening, type ScreeningSession } from "./screening.svelte.ts";

	interface Props {
		session: ScreeningSession;
		/** Show the QR code on the screen even while the video is not at its start */
		qr?: boolean;
	}
	let { session, qr = $bindable(false) }: Props = $props();

	// Takes the player's place while the video plays in the screening window. Playback is
	// controlled with the bar below and the timeline, as always.

	// The link as the share-link list knows it: renewing or deleting it there shows up here
	const links = $derived(getShareLinks(session.exportId));
	const link = $derived(links.current?.find((l) => l.id === session.link.id));

	let now = $state(new Date());
	onMount(() => {
		// Guests join during the screening; a look every few seconds is enough for the counter
		const timer = setInterval(() => {
			now = new Date();
			void links.refresh();
		}, 15_000);
		return () => clearInterval(timer);
	});

	const inactive = $derived(!!link && link.status !== "active");
	const expiresSoon = $derived(!!link && !inactive && screeningExpiresSoon(link.expiresAt, now));

	let image = $state<string | null>(null);
	$effect(() => {
		let cancelled = false;
		QRCode.toDataURL(session.shareUrl, { width: 320, margin: 1 }).then((data) => {
			if (!cancelled) image = data;
		});
		return () => {
			cancelled = true;
		};
	});

	let copied = $state(false);
	async function copy() {
		await navigator.clipboard.writeText(session.shareUrl);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="flex h-full items-center justify-center overflow-auto bg-base-200 p-4">
	<div class="flex max-w-2xl flex-col gap-4">
		<div class="flex items-center gap-5">
			{#if image}
				<img src={image} alt="QR code of the screening link" class="size-32 shrink-0 bg-white" />
			{/if}
			<div class="grid gap-2">
				<h2 class="flex items-center gap-2 text-lg font-semibold">
					<Projector size={20} />
					{session.connected
						? "Screening is running"
						: session.restored
							? "Reconnecting to the screening window…"
							: "Opening the screening window…"}
				</h2>
				<p class="text-sm text-base-content/70">
					The video plays in the screening window. Move that window to the projector or external
					screen, click <strong>Activate Player</strong> there and go fullscreen with
					<kbd class="kbd kbd-sm">F</kbd>. You control playback from here.
				</p>
				{#if link}
					<p class="flex items-center gap-1.5 text-sm text-base-content/70">
						<Users size={14} />
						{link.guestCount}{link.maxGuests ? ` of ${link.maxGuests}` : ""} guests joined
					</p>
					{#if link.category}
						<p class="flex items-center gap-1.5 text-sm text-base-content/70">
							<Tag size={14} /> Their markers get the category "{link.category.name}"
						</p>
					{/if}
				{/if}
			</div>
		</div>

		{#if session.connected && !session.activated}
			<div role="alert" class="alert text-sm alert-warning">
				<TriangleAlert size={18} />
				<span>
					Click <strong>Activate Player</strong> in the screening window. Until then the browser doesn't
					let it play with sound.
				</span>
				<button class="btn btn-sm" onclick={() => session.focusWindow()}>Show window</button>
			</div>
		{/if}
		{#if inactive}
			<div role="alert" class="alert text-sm alert-error">
				<TriangleAlert size={18} />
				<span
					>The screening link is no longer active, so guests can't join. Renew it in the share links
					or start a new screening.</span
				>
			</div>
		{:else if expiresSoon && link}
			<div role="alert" class="alert text-sm alert-warning">
				<TriangleAlert size={18} />
				<span>
					The screening link {formatExpiry(link.expiresAt, now).toLowerCase()}. After that guests
					can't join or add markers. You can renew it in the share links.
				</span>
			</div>
		{/if}

		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-sm {qr ? 'btn-active' : ''}"
				aria-pressed={qr}
				title="The QR code shows by itself while the video waits at its start"
				onclick={() => (qr = !qr)}
			>
				<QrCode size={16} />
				{qr ? "Hide QR code on screen" : "Show QR code on screen"}
			</button>
			<button class="btn btn-sm" onclick={() => session.focusWindow()}>
				<AppWindow size={16} /> Show window
			</button>
			<button class="btn btn-sm" onclick={copy}>
				{#if copied}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy link{/if}
			</button>
			<span class="flex-1"></span>
			<button class="btn btn-error btn-sm" onclick={() => requestStopScreening()}
				>End screening</button
			>
		</div>
	</div>
</div>
