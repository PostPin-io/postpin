<script lang="ts">
	import FolderOpen from "@lucide/svelte/icons/folder-open";
	import type { Capabilities, Settings } from "../bridge";
	import { errorMessage } from "../errors";
	import { getBridges } from "./context";

	interface Props {
		capabilities: Capabilities;
		settings: Settings;
	}

	let { capabilities, settings = $bindable() }: Props = $props();

	const { nle, host } = getBridges();

	// null while loading
	let presets = $state<string[] | null>(null);
	let presetsError = $state<string | null>(null);

	$effect(() => {
		if (!capabilities.renderPresets || !settings.renderToDisk || presets) return;
		nle
			.getRenderPresets()
			.then((list) => {
				presets = list;
				// a preset removed in the NLE since the last run, or none chosen yet: take the first
				if (!list.includes(settings.renderPreset)) settings.renderPreset = list[0] ?? "";
			})
			.catch((err: unknown) => (presetsError = errorMessage(err)));
	});

	async function pickFolder() {
		const folder = await host.pickDirectory();
		// empty when the dialog was cancelled: keep the folder there was
		if (folder) settings.outputPath = folder;
	}
</script>

<fieldset class="fieldset w-full gap-3">
	<label class="flex cursor-pointer items-center justify-between gap-3">
		<span class="text-sm font-semibold">Additionally render to disk</span>
		<input type="checkbox" bind:checked={settings.renderToDisk} class="toggle toggle-primary" />
	</label>
	<p class="text-xs text-base-content/60">
		Renders a second file with one of your presets into a folder, while the export uploads.
	</p>

	{#if settings.renderToDisk}
		{#if capabilities.renderPresets}
			<label class="flex flex-col gap-1">
				<span class="text-xs font-semibold">Render preset</span>
				{#if presetsError}
					<span class="text-xs text-error">Couldn't load the presets: {presetsError}</span>
				{:else if presets?.length === 0}
					<span class="text-xs text-base-content/60">No render presets in this project.</span>
				{:else}
					<select bind:value={settings.renderPreset} class="select w-full" disabled={!presets}>
						{#if presets}
							{#each presets as preset (preset)}
								<option value={preset}>{preset}</option>
							{/each}
						{:else}
							<option value={settings.renderPreset}>Loading presets…</option>
						{/if}
					</select>
				{/if}
			</label>
		{/if}

		<div class="flex flex-col gap-1">
			<label for="disk-render-folder" class="text-xs font-semibold">Folder</label>
			<div class="join w-full">
				<input
					id="disk-render-folder"
					type="text"
					bind:value={settings.outputPath}
					placeholder="Choose a folder"
					class="input join-item min-w-0 flex-1"
				/>
				<button type="button" class="btn join-item" onclick={pickFolder}>
					<FolderOpen size={16} /> Browse…
				</button>
			</div>
		</div>

		<label class="flex flex-col gap-1">
			<span class="text-xs font-semibold">File name</span>
			<input
				type="text"
				bind:value={settings.filename}
				placeholder="Name from the preset"
				class="input w-full"
			/>
		</label>
	{/if}
</fieldset>
