<script lang="ts">
	import X from "@lucide/svelte/icons/x";

	let dialog: HTMLDialogElement | null = null;

	interface Props {
		projects: {
			id: string;
			name: string;
			organization?: { id: string; name: string };
			timelines: {
				id: string;
				name: string;
				exports?: {
					id: string;
					name: string;
				}[];
			}[];
		}[];
		// "timeline": Projects | Timelines, "export": Projects | Timelines | Exports
		mode: "timeline" | "export";
		onSelect: (projectId: string, timelineId: string, exportId?: string) => void;
		selectedProjectId?: string;
		selectedTimelineId?: string;
		selectedExportId?: string;
	}

	let { projects, mode, onSelect, selectedExportId, selectedTimelineId, selectedProjectId }: Props =
		$props();

	// What's highlighted in the columns, only applied on "Select"
	let projectId = $state<string | null>(null);
	let timelineId = $state<string | null>(null);
	let exportId = $state<string | null>(null);

	const project = $derived(projects.find((p) => p.id === projectId));
	const timeline = $derived(project?.timelines.find((t) => t.id === timelineId));
	const exportItem = $derived(timeline?.exports?.find((e) => e.id === exportId));
	const canSelect = $derived(mode === "timeline" ? !!timeline : !!exportItem);

	// Only worth showing when the user is in more than one organization
	const showOrganizations = $derived(
		new Set(projects.map((p) => p.organization?.id).filter(Boolean)).size > 1,
	);
	const projectItems = $derived(
		projects.map((p) => ({
			id: p.id,
			name: p.name,
			hint: showOrganizations ? p.organization?.name : undefined,
		})),
	);

	// Opens on the current destination
	export function open() {
		projectId = selectedProjectId ?? null;
		timelineId = selectedTimelineId ?? null;
		exportId = selectedExportId ?? null;
		dialog?.showModal();
	}

	function pickProject(id: string) {
		if (id === projectId) return;
		projectId = id;
		timelineId = null;
		exportId = null;
	}

	function pickTimeline(id: string) {
		if (id === timelineId) return;
		timelineId = id;
		exportId = null;
	}

	function confirm() {
		if (!project || !timeline) return;
		if (mode === "export" && !exportItem) return;
		onSelect(project.id, timeline.id, exportItem?.id);
		dialog?.close();
	}
</script>

{#snippet column(
	title: string,
	items: { id: string; name: string; hint?: string }[],
	activeId: string | null,
	onPick: (id: string) => void,
	emptyText: string,
	drillsDown: boolean,
)}
	<div class="flex min-w-0 flex-col">
		<h4 class="px-2 pb-1 text-xs tracking-widest text-base-content/60 uppercase">{title}</h4>
		<ul class="menu h-72 w-full flex-nowrap overflow-y-auto rounded-box bg-base-200 p-1">
			{#each items as item (item.id)}
				<li>
					<button
						type="button"
						class={["justify-between", item.id === activeId && "menu-active"]}
						onclick={() => onPick(item.id)}
						ondblclick={() => !drillsDown && confirm()}
					>
						<span class="flex min-w-0 flex-col items-start">
							<span class="max-w-full truncate">{item.name}</span>
							{#if item.hint}
								<span class="max-w-full truncate text-xs text-base-content/60">{item.hint}</span>
							{/if}
						</span>
						{#if drillsDown}<span aria-hidden="true">›</span>{/if}
					</button>
				</li>
			{:else}
				<li class="p-2 text-sm text-base-content/60">{emptyText}</li>
			{/each}
		</ul>
	</div>
{/snippet}

<dialog class="modal" bind:this={dialog}>
	<div class={["modal-box", mode === "export" ? "max-w-4xl" : "max-w-2xl"]}>
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-bold">Choose {mode === "timeline" ? "timeline" : "export"}</h3>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => dialog?.close()}>
				<X />
			</button>
		</div>

		<div class={["grid gap-3 pt-4", mode === "export" ? "sm:grid-cols-3" : "sm:grid-cols-2"]}>
			{@render column("Projects", projectItems, projectId, pickProject, "No projects", true)}
			{@render column(
				"Timelines",
				project?.timelines ?? [],
				timelineId,
				pickTimeline,
				project ? "No timelines in this project" : "Choose a project",
				mode === "export",
			)}
			{#if mode === "export"}
				{@render column(
					"Exports",
					timeline?.exports ?? [],
					exportId,
					(id) => (exportId = id),
					timeline ? "No exports yet. Render one first." : "Choose a timeline",
					false,
				)}
			{/if}
		</div>

		<div class="modal-action items-center">
			<span class="mr-auto truncate text-sm text-base-content/60">
				{[project?.name, timeline?.name, mode === "export" ? exportItem?.name : undefined]
					.filter(Boolean)
					.join(" › ")}
			</span>
			<button type="button" class="btn" onclick={() => dialog?.close()}>Cancel</button>
			<button type="button" class="btn btn-primary" disabled={!canSelect} onclick={confirm}>
				Select
			</button>
		</div>
	</div>
	<!-- clicking the backdrop closes the modal -->
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
