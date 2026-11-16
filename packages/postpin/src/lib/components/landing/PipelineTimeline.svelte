<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import Clapperboard from "@lucide/svelte/icons/clapperboard";
	import CloudUpload from "@lucide/svelte/icons/cloud-upload";
	import Logo from "#lib/components/layout/Logo.svelte";
	import Smartphone from "@lucide/svelte/icons/smartphone";

	// The PostPin workflow as a timeline on the first slide: the cut travels from the editor on the
	// left, station by station, to the client on the right. There it turns into notes, which travel
	// back to the editor and land in its timeline as markers. Under each station a small card shows
	// what happens there, only while the dot or the notes are there.
	// Icons and shapes only.

	interface Props {
		/**
		 * For phones: a zoomed-in strip whose view follows the dot and the notes from station to
		 * station, instead of the whole timeline at once
		 */
		follow?: boolean;
		class?: string;
	}
	let { follow = false, class: className = "" }: Props = $props();

	const reducedMotion = new MediaQuery("prefers-reduced-motion: reduce");

	const LINE_Y = 50;
	const stations = [
		{ x: 120, icon: Clapperboard, label: "Your editor" },
		{ x: 440, icon: CloudUpload, label: "Upload" },
		// the review happens in PostPin itself, so this station shows its logo
		{ x: 760, icon: null, label: "Team review" },
		{ x: 1080, icon: Smartphone, label: "Client" },
	];
	const FIRST = stations[0]!.x;
	const LAST = stations.at(-1)!.x;

	/** Seconds to travel from one station to the next, and to wait at one */
	const TRAVEL = 1;
	/** long enough for the station's card to show what happens there */
	const HOLD = 1.6;
	/** Waiting at the editor at the end of a round, while the markers show */
	const REST = 2.6;

	// The stops of one round: there and back again, as station indexes
	const route = [0, 1, 2, 3, 2, 1, 0];
	type Stop = { station: number; arrive: number; leave: number };
	const stops: Stop[] = [];
	let clock = HOLD;
	route.forEach((station, i) => {
		const arrive = i === 0 ? 0 : clock + TRAVEL;
		const leave = i === route.length - 1 ? arrive + REST : arrive + HOLD;
		stops.push({ station, arrive, leave });
		clock = leave;
	});
	/** One round in seconds */
	const ROUND = clock;
	/** When the dot turns around at the client and becomes notes */
	const TURN = stops[3]!.leave;
	const BACK_HOME = stops.at(-1)!.arrive;

	const t = (seconds: number) => (seconds / ROUND).toFixed(4);
	const point = (station: number) => ((stations[station]!.x - FIRST) / (LAST - FIRST)).toFixed(4);

	// animateMotion along the line: wait at every stop, then move on to the next
	const motionTimes = [
		"0",
		...stops.flatMap((s, i) => (i === 0 ? [t(s.leave)] : [t(s.arrive), t(s.leave)])),
	];
	const motionPoints = [
		point(stops[0]!.station),
		...stops.flatMap((s, i) =>
			i === 0 ? [point(s.station)] : [point(s.station), point(s.station)],
		),
	];
	// the last stop rests until the round ends
	motionTimes[motionTimes.length - 1] = "1";

	// The camera for `follow`: a window of VIEW units that keeps the traveller in the middle, but
	// never looks past the first or the last station's card
	const WIDTH = 1200;
	const VIEW = 420;
	const camera = (fraction: number) => {
		const x = FIRST + fraction * (LAST - FIRST);
		return Math.min(Math.max(x - VIEW / 2, 0), WIDTH - VIEW);
	};
	// same keyTimes as the motion, so the view moves exactly with the traveller
	const cameraValues = motionPoints.map((p) => `${(-camera(Number(p))).toFixed(1)} 0`).join(";");
	/** Without motion: the view rests on the review in PostPin */
	const cameraStill = `translate(${-camera(Number(point(2)))} 0)`;

	/** A ring around a station that pulses at every arrival there */
	function pulse(station: number) {
		const arrivals = stops.filter((s, i) => i > 0 && s.station === station).map((s) => s.arrive);
		const times = ["0"];
		const radius = ["52"];
		const opacity = ["0"];
		for (const at of arrivals) {
			times.push(t(at - 0.01), t(at), t(at + 0.9));
			radius.push("52", "30", "52");
			opacity.push("0", "0.4", "0");
		}
		times.push("1");
		radius.push("52");
		opacity.push("0");
		return { times: times.join(";"), radius: radius.join(";"), opacity: opacity.join(";") };
	}

	/** Visible on the way there (the cut) or on the way back (the notes) */
	const outward = `1;1;0;0`;
	const homeward = `0;0;1;1`;
	const legTimes = `0;${t(TURN)};${t(TURN + 0.01)};1`;

	/** The notes that land in the editor's timeline when they're back, in category colors */
	const markers = [
		{ x: 70, color: "#f5b92f" },
		{ x: 105, color: "#e8559a" },
		{ x: 140, color: "#8a63d2" },
		{ x: 165, color: "#31b86a" },
	];
	/**
	 * values/keyTimes for an <animate> over one round, from [seconds, value] points. Between the
	 * points it eases linearly; before the first and after the last it holds their value.
	 */
	function keyed(points: [number, number][]) {
		const sorted = points
			.map(([at, value]) => [Math.min(Math.max(at, 0), ROUND), value] as const)
			.sort((a, b) => a[0] - b[0]);
		const all: (readonly [number, number])[] = [];
		if (sorted[0]![0] > 0) all.push([0, sorted[0]![1]]);
		for (const p of sorted) if (!all.length || p[0] > all.at(-1)![0]) all.push(p);
		if (all.at(-1)![0] < ROUND) all.push([ROUND, all.at(-1)![1]]);
		return {
			times: all.map(([at]) => t(at)).join(";"),
			values: all.map(([, value]) => String(value)).join(";"),
		};
	}

	const visits = (station: number) => stops.filter((s, i) => i > 0 && s.station === station);

	/** A station's card: fades in when the traveller arrives, out again shortly after it leaves */
	const cardShown = (station: number) =>
		keyed([
			[0, 0],
			...visits(station).flatMap(
				(v) =>
					[
						[v.arrive - 0.05, 0],
						[v.arrive + 0.2, 1],
						[v.leave + 0.1, 1],
						[v.leave + 0.4, 0],
					] as [number, number][],
			),
		]);

	/**
	 * The editor's card: there while the cut leaves at the start of a round and from when the
	 * notes are back until the round ends, which runs straight into the next start
	 */
	const editorShown = keyed([
		[0, 1],
		[stops[0]!.leave + 0.1, 1],
		[stops[0]!.leave + 0.4, 0],
		[BACK_HOME - 0.05, 0],
		[BACK_HOME + 0.2, 1],
	]);

	/** Something in a card that pops in at `delay` seconds into the first visit and stays this round */
	const popsIn = (station: number, delay: number) => {
		const at = visits(station)[0]!.arrive + delay;
		return keyed([
			[0, 0],
			[at - 0.01, 0],
			[at, 1],
			[ROUND - 0.02, 1],
			[ROUND, 0],
		]);
	};

	/** The upload's progress: 0 to 1 during each visit of the upload station */
	const uploadProgress = keyed(
		visits(1).flatMap(
			(v) =>
				[
					[v.arrive - 0.01, 0],
					[v.arrive + 0.2, 0],
					[v.leave - 0.1, 1],
				] as [number, number][],
		),
	);

	/** The colleagues' markers in the review card and their rows in the marker list */
	const colleagues = [
		{ x: 712, color: "#f5b92f" },
		{ x: 736, color: "#e8559a" },
		{ x: 758, color: "#8a63d2" },
	];

	/** A small QR code for the client card: finder squares in three corners, a fixed pattern */
	const QR_PATTERN = [0b10111, 0b01010, 0b11101, 0b00110, 0b10101];

	const markersShown = (i: number) => {
		const show = BACK_HOME + 0.2 + i * 0.25;
		return {
			times: `0;${t(show - 0.01)};${t(show)};${t(ROUND - 0.4)};1`,
			values: "0;0;1;1;0",
		};
	};
</script>

<svg
	viewBox="0 0 {follow ? VIEW : WIDTH} 160"
	class="pointer-events-none text-base-content {className}"
	aria-hidden="true"
>
	<g transform={follow ? cameraStill : undefined}>
		{#if follow && !reducedMotion.current}
			<animateTransform
				attributeName="transform"
				type="translate"
				values={cameraValues}
				keyTimes={motionTimes.join(";")}
				calcMode="linear"
				dur="{ROUND}s"
				repeatCount="indefinite"
			/>
		{/if}
		<!-- the timeline: a line with ruler ticks -->
		<line
			x1={FIRST}
			x2={LAST}
			y1={LINE_Y}
			y2={LINE_Y}
			stroke="currentColor"
			stroke-opacity="0.15"
			stroke-width="2"
		/>
		{#each Array.from({ length: 33 }, (_, i) => FIRST + i * 30) as x (x)}
			<line
				x1={x}
				x2={x}
				y1={LINE_Y + 6}
				y2={LINE_Y + (x % 150 === 120 ? 16 : 11)}
				stroke="currentColor"
				stroke-opacity="0.12"
				stroke-width="2"
			/>
		{/each}

		{#if !reducedMotion.current}
			<!-- what travels: the cut on the way there, the notes on the way back. Drawn before the
			stations, so it disappears into each one while it waits there -->
			<g>
				<animateMotion
					path="M{FIRST},{LINE_Y} H{LAST}"
					keyPoints={motionPoints.join(";")}
					keyTimes={motionTimes.join(";")}
					calcMode="linear"
					dur="{ROUND}s"
					repeatCount="indefinite"
				/>
				<g opacity="1">
					<animate
						attributeName="opacity"
						values={outward}
						keyTimes={legTimes}
						dur="{ROUND}s"
						repeatCount="indefinite"
					/>
					<circle r="9" fill="#3d7fff" />
				</g>
				<g opacity="0">
					<animate
						attributeName="opacity"
						values={homeward}
						keyTimes={legTimes}
						dur="{ROUND}s"
						repeatCount="indefinite"
					/>
					<path d="M-14,-7 l7,7 l-7,7 l-7,-7 z" fill="#f5b92f" />
					<path d="M0,-7 l7,7 l-7,7 l-7,-7 z" fill="#e8559a" />
					<path d="M14,-7 l7,7 l-7,7 l-7,-7 z" fill="#8a63d2" />
				</g>
			</g>
		{/if}

		{#each stations as station, i (station.label)}
			<g transform="translate({station.x} {LINE_Y})">
				{#if !reducedMotion.current}
					{@const ring = pulse(i)}
					<circle r="30" fill="none" stroke="currentColor" stroke-width="2" opacity="0">
						<animate
							attributeName="r"
							values={ring.radius}
							keyTimes={ring.times}
							dur="{ROUND}s"
							repeatCount="indefinite"
						/>
						<animate
							attributeName="opacity"
							values={ring.opacity}
							keyTimes={ring.times}
							dur="{ROUND}s"
							repeatCount="indefinite"
						/>
					</circle>
				{/if}
				<circle
					r="30"
					class="fill-base-100"
					stroke="currentColor"
					stroke-opacity="0.18"
					stroke-width="2"
				/>
				{#if station.icon}
					<station.icon x={-14} y={-14} width={28} height={28} stroke-width={1.5} opacity={0.6} />
				{:else}
					<!-- in its own colors, the one station that isn't gray -->
					<Logo x={-18} y={-16} width={36} height={32} />
				{/if}
			</g>
		{/each}

		{#snippet frame(x: number, y: number, w: number, h: number)}
			<!-- a still from the cut, like in the editor card -->
			<rect {x} {y} width={w} height={h} rx="3" fill="#2c4f7c" />
			<rect {x} y={y + h * 0.55} width={w} height={h * 0.45} rx="3" fill="#24406a" />
			<circle cx={x + w * 0.7} cy={y + h * 0.35} r={h * 0.13} fill="#f5b92f" />
		{/snippet}

		{#snippet card(cx: number)}
			<rect
				x={cx - 76}
				y="-28"
				width="152"
				height="60"
				rx="12"
				class="fill-base-100"
				stroke="currentColor"
				stroke-opacity="0.15"
				stroke-width="2"
			/>
		{/snippet}

		{#snippet appear(timing: { times: string; values: string })}
			{#if !reducedMotion.current}
				<animate
					attributeName="opacity"
					values={timing.values}
					keyTimes={timing.times}
					dur="{ROUND}s"
					repeatCount="indefinite"
				/>
			{/if}
		{/snippet}

		<!-- Upload: the cut and a progress bar that fills while the dot is there -->
		<g transform="translate(0 122)" opacity={reducedMotion.current ? 1 : 0}>
			{@render appear(cardShown(1))}
			{@render card(440)}
			{@render frame(378, -16, 36, 24)}
			<rect x="424" y="-14" width="50" height="5" rx="2.5" fill="currentColor" opacity="0.2" />
			<rect x="424" y="-2" width="78" height="7" rx="3.5" fill="currentColor" opacity="0.1" />
			<rect
				x="424"
				y="-2"
				height="7"
				rx="3.5"
				fill="#3d7fff"
				width={reducedMotion.current ? 78 : 0}
			>
				{#if !reducedMotion.current}
					<animate
						attributeName="width"
						values={uploadProgress.values.replaceAll(/[\d.]+/g, (v) => String(Number(v) * 78))}
						keyTimes={uploadProgress.times}
						dur="{ROUND}s"
						repeatCount="indefinite"
					/>
				{/if}
			</rect>
			<rect x="378" y="16" width="96" height="5" rx="2.5" fill="currentColor" opacity="0.12" />
		</g>

		<!-- Team review in PostPin: the player, and markers by colleagues with their rows in the list -->
		<g transform="translate(0 122)" opacity={reducedMotion.current ? 1 : 0}>
			{@render appear(cardShown(2))}
			{@render card(760)}
			{@render frame(696, -18, 72, 34)}
			<rect x="696" y="22" width="72" height="3" rx="1.5" fill="currentColor" opacity="0.15" />
			{#each colleagues as colleague, i (colleague.x)}
				<g opacity={reducedMotion.current ? 1 : 0}>
					{@render appear(popsIn(2, 0.3 + i * 0.35))}
					<path d="M{colleague.x},17 l5,5.5 l-5,5.5 l-5,-5.5 z" fill={colleague.color} />
					<circle cx="782" cy={-12 + i * 13} r="4" fill={colleague.color} />
					<rect
						x="790"
						y={-14 + i * 13}
						width="34"
						height="4"
						rx="2"
						fill="currentColor"
						opacity="0.2"
					/>
				</g>
			{/each}
		</g>

		<!-- The client: the QR code of the share link, then their marker -->
		<g transform="translate(0 122)" opacity={reducedMotion.current ? 1 : 0}>
			{@render appear(cardShown(3))}
			{@render card(1080)}
			<rect
				x="1016"
				y="-18"
				width="40"
				height="40"
				rx="4"
				fill="#ffffff"
				stroke="currentColor"
				stroke-opacity="0.15"
			/>
			{#each QR_PATTERN as row, r (r)}
				{#each [0, 1, 2, 3, 4] as c (c)}
					{#if row & (1 << (4 - c))}
						<rect x={1020 + c * 6.4} y={-14 + r * 6.4} width="6" height="6" fill="#111317" />
					{/if}
				{/each}
			{/each}
			<circle cx="1072" cy="-8" r="5" fill="#31b86a" />
			<rect x="1081" y="-10" width="40" height="4" rx="2" fill="currentColor" opacity="0.2" />
			<rect x="1066" y="6" width="74" height="3" rx="1.5" fill="currentColor" opacity="0.15" />
			<g opacity={reducedMotion.current ? 1 : 0}>
				{@render appear(popsIn(3, 0.6))}
				<path d="M1110,1 l5.5,6 l-5.5,6 l-5.5,-6 z" fill="#31b86a" />
			</g>
			{#if !reducedMotion.current}
				<!-- the tap that sets it -->
				<circle cx="1110" cy="7" r="4" fill="none" stroke="#31b86a" stroke-width="2" opacity="0">
					<animate
						attributeName="r"
						values={keyed([
							[0, 4],
							[visits(3)[0]!.arrive + 0.55, 4],
							[visits(3)[0]!.arrive + 1.1, 16],
						]).values}
						keyTimes={keyed([
							[0, 4],
							[visits(3)[0]!.arrive + 0.55, 4],
							[visits(3)[0]!.arrive + 1.1, 16],
						]).times}
						dur="{ROUND}s"
						repeatCount="indefinite"
					/>
					<animate
						attributeName="opacity"
						values={keyed([
							[0, 0],
							[visits(3)[0]!.arrive + 0.54, 0],
							[visits(3)[0]!.arrive + 0.55, 0.8],
							[visits(3)[0]!.arrive + 1.1, 0],
						]).values}
						keyTimes={keyed([
							[0, 0],
							[visits(3)[0]!.arrive + 0.54, 0],
							[visits(3)[0]!.arrive + 0.55, 0.8],
							[visits(3)[0]!.arrive + 1.1, 0],
						]).times}
						dur="{ROUND}s"
						repeatCount="indefinite"
					/>
				</circle>
			{/if}
		</g>

		<!-- the editor's timeline under the first station: clips, and the notes that come back -->
		<g transform="translate(0 122)">
			{@render appear(editorShown)}
			<rect
				x="44"
				y="-28"
				width="152"
				height="60"
				rx="12"
				class="fill-base-100"
				stroke="currentColor"
				stroke-opacity="0.15"
				stroke-width="2"
			/>
			<rect x="60" y="0" width="56" height="10" rx="3" fill="#3d7fff" opacity="0.5" />
			<rect x="120" y="0" width="34" height="10" rx="3" fill="#21b8cf" opacity="0.5" />
			<rect x="158" y="0" width="22" height="10" rx="3" fill="#3d7fff" opacity="0.5" />
			<rect x="60" y="14" width="120" height="8" rx="3" fill="#31b86a" opacity="0.4" />
			{#each markers as marker, i (marker.x)}
				<path
					d="M{marker.x},-16 l7,7 l-7,7 l-7,-7 z"
					fill={marker.color}
					opacity={reducedMotion.current ? 1 : 0}
				>
					{#if !reducedMotion.current}
						{@const shown = markersShown(i)}
						<animate
							attributeName="opacity"
							values={shown.values}
							keyTimes={shown.times}
							dur="{ROUND}s"
							repeatCount="indefinite"
						/>
					{/if}
				</path>
			{/each}
		</g>
	</g>
</svg>
