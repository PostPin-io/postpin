<script lang="ts">
	import { Spring } from "svelte/motion";

	const count = new Spring(0);
	const offset = $derived(modulo(count.current, 1));

	function modulo(n: number, m: number) {
		// handle negative numbers
		return ((n % m) + m) % m;
	}
</script>

<div class="flex items-center gap-4">
	<button
		onclick={() => (count.target -= 1)}
		aria-label="Decrease the counter by one"
		class="btn btn-primary"
	>
		-
	</button>

	<div>
		<div style="transform: translate(0, {100 * offset}%)">
			<strong class="hidden" aria-hidden="true">{Math.floor(count.current + 1)}</strong>
			<strong>{Math.floor(count.current)}</strong>
		</div>
	</div>

	<button
		onclick={() => (count.target += 1)}
		aria-label="Increase the counter by one"
		class="btn btn-primary"
	>
		+
	</button>
</div>
