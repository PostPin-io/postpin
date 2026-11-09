<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import Plus from "@lucide/svelte/icons/plus";
	import { errorMessage } from "../errors";

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
		// Without organizationId the server uses the user's active organization. Both resolve to the new id.
		onCreateProject?: (name: string, organizationId?: string) => Promise<string>;
		onCreateTimeline?: (projectId: string, name: string) => Promise<string>;
		selectedProjectId?: string;
		selectedTimelineId?: string;
		selectedExportId?: string;
	}

	let {
		projects,
		mode,
		onSelect,
		onCreateProject,
		onCreateTimeline,
		selectedExportId,
		selectedTimelineId,
		selectedProjectId,
	}: Props = $props();

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
	const organizations = $derived([
		...new Map(
			projects.flatMap((p) => (p.organization ? [[p.organization.id, p.organization]] : [])),
		).values(),
	]);
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
		stopCreating();
		dialog?.showModal();
	}

	// Inline "new project / new timeline" row at the top of a column
	let creating = $state<"project" | "timeline" | null>(null);
	let newName = $state("");
	let newOrganizationId = $state("");
	let isCreating = $state(false);
	let createError = $state<string | null>(null);

	function startCreating(kind: "project" | "timeline") {
		creating = kind;
		newName = "";
		newOrganizationId = project?.organization?.id ?? organizations[0]?.id ?? "";
		createError = null;
	}

	function stopCreating() {
		creating = null;
		createError = null;
	}

	async function create() {
		const name = newName.trim();
		if (!creating || !name || isCreating) return;
		isCreating = true;
		createError = null;
		try {
			if (creating === "project" && onCreateProject) {
				// The organization can only be chosen when there are several
				const id = await onCreateProject(
					name,
					organizations.length > 1 ? newOrganizationId : undefined,
				);
				pickProject(id);
			} else if (creating === "timeline" && onCreateTimeline && project) {
				pickTimeline(await onCreateTimeline(project.id, name));
			}
			stopCreating();
		} catch (err) {
			createError = errorMessage(err);
		} finally {
			isCreating = false;
		}
	}

	function focus(node: HTMLElement) {
		node.focus();
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
	add?: { kind: "project" | "timeline"; label: string; disabled: boolean },
)}
	<div class="flex min-w-0 flex-col">
		<div class="flex items-center justify-between px-2 pb-1">
			<h4 class="text-xs tracking-widest text-base-content/60 uppercase">{title}</h4>
			{#if add}
				<button
					type="button"
					class="btn btn-square btn-ghost btn-xs"
					title={add.label}
					disabled={add.disabled || isCreating}
					onclick={() => startCreating(add.kind)}
				>
					<Plus size={14} />
				</button>
			{/if}
		</div>
		<ul class="menu h-72 w-full flex-nowrap overflow-y-auto rounded-box bg-base-200 p-1">
			{#if add && creating === add.kind}
				<li class="gap-1 p-1">
					<div class="flex w-full flex-col items-stretch gap-1 p-0 hover:bg-transparent">
						{#if add.kind === "project" && organizations.length > 1}
							<select
								class="select w-full select-sm"
								disabled={isCreating}
								bind:value={newOrganizationId}
							>
								{#each organizations as organization (organization.id)}
									<option value={organization.id}>{organization.name}</option>
								{/each}
							</select>
						{/if}
						<input
							type="text"
							class="input w-full input-sm"
							placeholder={add.kind === "project" ? "Project name" : "Timeline name"}
							maxlength="100"
							disabled={isCreating}
							bind:value={newName}
							use:focus
							onkeydown={(e) => {
								if (e.key === "Enter") create();
								else if (e.key === "Escape") {
									// Escape would otherwise close the whole dialog
									e.preventDefault();
									e.stopPropagation();
									stopCreating();
								}
							}}
						/>
						{#if createError}
							<span class="text-xs text-error">{createError}</span>
						{/if}
						<div class="flex justify-end gap-1">
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								disabled={isCreating}
								onclick={stopCreating}
							>
								Cancel
							</button>
							<button
								type="button"
								class="btn btn-xs btn-primary"
								disabled={isCreating || !newName.trim()}
								onclick={create}
							>
								Create
								{#if isCreating}<span class="loading loading-xs loading-spinner"></span>{/if}
							</button>
						</div>
					</div>
				</li>
			{/if}
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
				{#if !(add && creating === add.kind)}
					<li class="p-2 text-sm text-base-content/60">{emptyText}</li>
				{/if}
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
			{@render column(
				"Projects",
				projectItems,
				projectId,
				pickProject,
				"No projects",
				true,
				onCreateProject && {
					kind: "project",
					label: "New project",
					disabled: false,
				},
			)}
			{@render column(
				"Timelines",
				project?.timelines ?? [],
				timelineId,
				pickTimeline,
				project ? "No timelines in this project" : "Choose a project",
				mode === "export",
				onCreateTimeline && {
					kind: "timeline",
					label: "New timeline",
					disabled: !project,
				},
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
