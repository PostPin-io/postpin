<script lang="ts">
	// How the first export gets out of the editing software: the same in every plugin. Installing
	// and opening them differs, that is what the detailed guides are for.
	import BookOpen from "@lucide/svelte/icons/book-open";
	import Check from "@lucide/svelte/icons/check";
	import Copy from "@lucide/svelte/icons/copy";
	import FolderTree from "@lucide/svelte/icons/folder-tree";
	import LogIn from "@lucide/svelte/icons/log-in";
	import Plug from "@lucide/svelte/icons/plug";
	import Upload from "@lucide/svelte/icons/upload";
	import { PLUGIN_GUIDES } from "./doc-links.ts";

	interface Props {
		projectName: string;
		timelineName: string;
		/** This server's address when the plugins don't know it: a self-hosted PostPin */
		serverUrl: string | null;
	}
	let { projectName, timelineName, serverUrl }: Props = $props();

	let copied = $state(false);
	async function copyServerUrl() {
		if (!serverUrl) return;
		await navigator.clipboard.writeText(serverUrl);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<ul class="space-y-3">
	<li class="flex gap-3">
		<Plug class="mt-0.5 size-5 shrink-0 text-primary" />
		<span>Install the plugin and open it in your editing software.</span>
	</li>
	<li class="flex gap-3">
		<LogIn class="mt-0.5 size-5 shrink-0 text-primary" />
		<span class="min-w-0">
			Click <strong>Login</strong> and confirm with <strong>Allow access</strong> in your browser.
			{#if serverUrl}
				Before that, turn off <strong>Use hosted PostPin server</strong> and enter this server:
				<span class="join mt-1 flex max-w-full">
					<code class="join-item min-w-0 flex-1 truncate bg-base-200 px-3 py-2 text-sm"
						>{serverUrl}</code
					>
					<button
						type="button"
						class="btn join-item h-auto btn-sm"
						aria-label="Copy server address"
						title={copied ? "Copied" : "Copy"}
						onclick={copyServerUrl}
					>
						{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}
					</button>
				</span>
			{/if}
		</span>
	</li>
	<li class="flex gap-3">
		<FolderTree class="mt-0.5 size-5 shrink-0 text-primary" />
		<span class="min-w-0">
			Under <strong>Upload to</strong>, choose
			<strong class="break-words">{projectName} › {timelineName}</strong>.
		</span>
	</li>
	<li class="flex gap-3">
		<Upload class="mt-0.5 size-5 shrink-0 text-primary" />
		<span>Click <strong>Render & Upload</strong>.</span>
	</li>
</ul>

<div class="mt-5 rounded-box border border-base-300 p-4">
	<p class="flex items-center gap-2 font-semibold">
		<BookOpen class="size-5 shrink-0" />
		Detailed guide for your editing software
	</p>
	<div class="mt-3 flex flex-wrap gap-2">
		{#each PLUGIN_GUIDES as guide (guide.href)}
			<a
				class="btn btn-outline btn-sm max-sm:w-full"
				href={guide.href}
				target="_blank"
				rel="noopener noreferrer"
			>
				{guide.label}
			</a>
		{/each}
	</div>
</div>
