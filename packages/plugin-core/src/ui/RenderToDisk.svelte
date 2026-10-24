<script lang="ts">
	import type { Capabilities, Settings } from "../bridge";
	import { getBridges } from "./context";

	interface Props {
		capabilities: Capabilities;
		settings: Settings;
	}

	let { capabilities, settings = $bindable() }: Props = $props();

	const { nle, host } = getBridges();

	let renderPreset = $state("");
</script>

<label class="label">
	<span class="label-text">Additionally render to Disk</span>
	<input type="checkbox" bind:checked={settings.renderToDisk} class="toggle toggle-primary" />
</label>

{#if settings.renderToDisk}
	{#if capabilities.renderPresets}
		<select bind:value={renderPreset} class="select">
			{#each await nle.getRenderPresets() as preset}
				<option value={preset}>{preset}</option>
			{/each}
		</select>
	{/if}

	<div>
		<input
			type="text"
			bind:value={settings.outputPath}
			placeholder="Enter render path"
			class="input input-bordered w-full max-w-xs"
		/>
		<button
			onclick={async () => (settings.outputPath = await host.pickDirectory())}
			class="btn btn-secondary ml-2">Pick Directory</button
		>
	</div>

	<input
		type="text"
		bind:value={settings.filename}
		placeholder="Enter render filename"
		class="input input-bordered w-full max-w-xs"
	/>
{/if}
