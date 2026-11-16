<script lang="ts">
	// The step bar of part 1. "Account" is done as soon as there is someone to show it to.
	const STEPS = ["Account", "Organization", "Project", "Timeline", "Upload"];

	interface Props {
		/** Index into the steps of the one the user is at; everything before it is done */
		current: number;
	}
	let { current }: Props = $props();
</script>

<!-- Phones: no room for five labels -->
<p class="text-center text-sm text-base-content/60 sm:hidden">
	Step {Math.min(current, STEPS.length - 1) + 1} of {STEPS.length}: {STEPS[
		Math.min(current, STEPS.length - 1)
	]}
</p>
<ul class="steps hidden w-full text-sm sm:grid">
	{#each STEPS as step, index (step)}
		<li
			class="step {index <= current ? 'step-primary' : ''}"
			aria-current={index === current ? "step" : undefined}
		>
			{step}
		</li>
	{/each}
</ul>
