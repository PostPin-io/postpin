<script lang="ts">
	import { errorMessage } from "@postpin-io/plugin-core/errors";
	import {
		DesktopAPI,
		type HostOption,
		type IDesktopAPIRenderer,
	} from "../ipc/renderer/PostPinDesktop";

	// The preload exposes every method, Partial only reflects that eipc can't prove it
	if (!DesktopAPI) throw new Error("DesktopAPI is not exposed, is the desktop preload loaded?");
	const api = DesktopAPI as IDesktopAPIRenderer;

	let hosts = $state<HostOption[]>([]);
	let selected = $state("");
	let error = $state<string | null>(null);

	Promise.all([api.listHosts(), api.getSelectedHost()]).then(([list, id]) => {
		hosts = list;
		selected = id;
	});

	// The UI reloads, so every component starts over with the new host
	async function change(event: Event & { currentTarget: HTMLSelectElement }) {
		const select = event.currentTarget;
		error = null;
		try {
			await api.selectHost(select.value);
			window.location.reload();
		} catch (err) {
			// Electron prefixes errors from the main process, keep only the message
			error = errorMessage(err).replace(/^Error invoking remote method '[^']*': (Error: )?/, "");
			select.value = selected;
		}
	}
</script>

<label class="flex flex-col gap-1 pr-8">
	<span class="text-sm text-base-content/60">Program</span>
	<select class="select select-sm w-full" value={selected} onchange={change}>
		{#each hosts as host (host.id)}
			<option value={host.id}>{host.name}</option>
		{/each}
	</select>
	{#if error}
		<span class="text-sm text-error">{error}</span>
	{/if}
</label>
