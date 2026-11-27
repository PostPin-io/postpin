import { error } from "@sveltejs/kit";
import type { Prisma } from "@postpin-io/shared/db";
import {
	changedState,
	COALESCE_MS,
	conflictingMarkers,
	exportsOf,
	MARKER_STATE_FORMAT,
	MAX_UNDO_STEPS,
	stepLabel,
	UNDO_RETENTION_MS,
	type MarkerState,
	type MarkerStateEntry,
	type UndoAction,
} from "@postpin-io/shared/logic/marker-history";
import { prisma } from "#lib/server/database.ts";
import { accessChecker, authorize } from "#lib/server/org-access.ts";
import { readExport, requireMarkers } from "#lib/server/review-access.ts";
import {
	categoryResolver,
	deleteMarkersRecorded,
	existingIds,
	snapshotInclude,
	toSnapshotEntry,
} from "#lib/server/marker-sets.ts";

// The web app's undo history, see shared/src/logic/marker-history.ts. Every marker action of the
// review page runs through recordStep(); undoStep() and redoStep() go back and forth between the
// states it stored.

type Tx = Prisma.TransactionClient;

/** Whose history: a team member's, or a share guest's (one per link and browser) */
export type Actor =
	{ userId: string; guestId?: undefined } | { guestId: string; userId?: undefined };

export const ownerWhere = (actor: Actor) =>
	actor.userId ? { userId: actor.userId } : { guestId: actor.guestId! };

/** One history at a time: two windows pressing ⌘Z at once must not undo the same step twice */
async function lockHistory(tx: Tx, actor: Actor) {
	const key = actor.userId ? `user:${actor.userId}` : `guest:${actor.guestId}`;
	await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}

/** The markers with these ids as they are now; ids that don't exist are left out */
export async function markerState(tx: Tx, ids: string[]): Promise<MarkerState> {
	const markers = ids.length
		? await tx.marker.findMany({ where: { id: { in: ids } }, include: snapshotInclude })
		: [];
	return {
		format: MARKER_STATE_FORMAT,
		markers: markers.map((m) => ({ ...toSnapshotEntry(m), exportId: m.exportId })),
	};
}

export interface StepInput {
	action: UndoAction;
	/** The markers the action changes; the ones it creates come from `run` */
	ids: string[];
	/** Consecutive steps with this key are merged into one, see COALESCE_MS */
	coalesceKey?: string;
}

/**
 * Runs a marker action and stores it as a step of the actor's history, in the transaction the
 * action runs in. An action that changes nothing leaves no step. A new step ends the redo.
 */
export async function recordStep<T>(
	tx: Tx,
	actor: Actor,
	input: StepInput,
	run: () => Promise<T>,
	created: (result: T) => string[] = () => [],
): Promise<T> {
	await lockHistory(tx, actor);
	const before = await markerState(tx, input.ids);
	const result = await run();
	const scope = [...new Set([...input.ids, ...created(result)])];
	const after = await markerState(tx, scope);
	if (!changedState(scope, before, after)) return result;

	const owner = ownerWhere(actor);
	await tx.markerUndoStep.deleteMany({ where: { ...owner, undoneAt: { not: null } } });

	if (input.coalesceKey) {
		const last = await tx.markerUndoStep.findFirst({
			where: owner,
			orderBy: { createdAt: "desc" },
			select: { id: true, coalesceKey: true, updatedAt: true, exportIds: true, markerIds: true },
		});
		if (
			last &&
			last.coalesceKey === input.coalesceKey &&
			Date.now() - last.updatedAt.getTime() < COALESCE_MS &&
			scope.every((id) => last.markerIds.includes(id))
		) {
			await tx.markerUndoStep.update({
				where: { id: last.id },
				data: {
					after: json(after),
					exportIds: [...new Set([...last.exportIds, ...exportsOf(after)])],
				},
			});
			return result;
		}
	}

	await tx.markerUndoStep.create({
		data: {
			...owner,
			action: input.action,
			label: stepLabel(input.action, scope.length),
			coalesceKey: input.coalesceKey ?? null,
			exportIds: exportsOf(before, after),
			markerIds: scope,
			before: json(before),
			after: json(after),
		},
	});
	await pruneHistory(tx, actor);
	return result;
}

const json = (state: MarkerState) => state as unknown as Prisma.InputJsonValue;
const stateOf = (value: Prisma.JsonValue) => value as unknown as MarkerState;

/** 30 days, and no more than MAX_UNDO_STEPS per history */
async function pruneHistory(tx: Tx, actor: Actor) {
	const owner = ownerWhere(actor);
	const oldest = await tx.markerUndoStep.findFirst({
		where: owner,
		orderBy: { createdAt: "desc" },
		skip: MAX_UNDO_STEPS - 1,
		select: { createdAt: true },
	});
	const cutoff = new Date(Date.now() - UNDO_RETENTION_MS);
	await tx.markerUndoStep.deleteMany({
		where: {
			...owner,
			createdAt: { lt: oldest && oldest.createdAt > cutoff ? oldest.createdAt : cutoff },
		},
	});
}

/** For the daily cleanup of all histories */
export const undoRetentionCutoff = () => new Date(Date.now() - UNDO_RETENTION_MS);

// ─── Undo and redo ──────────────────────────────────────────────────────────

export type StepResult =
	| { status: "empty" }
	| { status: "conflict"; label: string; count: number }
	/** The step can't be taken back any more (its export is gone, access was lost): dropped */
	| { status: "expired"; label: string }
	| { status: "done"; label: string; exportIds: string[]; markerIds: string[] };

/**
 * Undoes the newest step that isn't undone, or redoes the oldest undone one. Markers someone
 * changed since make it a conflict unless `force` is set.
 */
export async function moveInHistory(
	direction: "undo" | "redo",
	actor: Actor,
	{ force = false, shareToken }: { force?: boolean; shareToken?: string },
): Promise<StepResult> {
	return prisma.$transaction(
		async (tx) => {
			await lockHistory(tx, actor);
			const owner = ownerWhere(actor);
			const step = await tx.markerUndoStep.findFirst({
				where: { ...owner, undoneAt: direction === "undo" ? null : { not: null } },
				orderBy: { createdAt: direction === "undo" ? "desc" : "asc" },
			});
			if (!step) return { status: "empty" } as const;

			const before = stateOf(step.before);
			const after = stateOf(step.after);
			const [expected, target] = direction === "undo" ? [after, before] : [before, after];
			const current = await markerState(tx, step.markerIds);

			if (!force) {
				const conflicts = conflictingMarkers(step.markerIds, current, expected, target);
				if (conflicts.length > 0) {
					return { status: "conflict", label: step.label, count: conflicts.length } as const;
				}
			}

			const allowed = await mayApply(actor, shareToken, current, target, step.markerIds);
			if (!allowed) {
				await tx.markerUndoStep.delete({ where: { id: step.id } });
				return { status: "expired", label: step.label } as const;
			}

			await applyState(tx, step.markerIds, current, target);
			await tx.markerUndoStep.update({
				where: { id: step.id },
				data: { undoneAt: direction === "undo" ? new Date() : null },
			});
			return {
				status: "done",
				label: step.label,
				exportIds: [...new Set([...step.exportIds, ...exportsOf(current)])],
				markerIds: step.markerIds,
			} as const;
		},
		{ timeout: 60_000, maxWait: 10_000 },
	);
}

/**
 * Whether the actor may take the markers from `current` to `target`: the same rights as doing it
 * by hand (deleting what goes away, creating what comes back, editing what changes). Roles and
 * grants may have changed since the step. False when an export is gone or out of reach.
 */
async function mayApply(
	actor: Actor,
	shareToken: string | undefined,
	current: MarkerState,
	target: MarkerState,
	scope: string[],
): Promise<boolean> {
	const now = new Map(current.markers.map((m) => [m.id, m]));
	const wanted = new Map(target.markers.map((m) => [m.id, m]));
	const exportIds = exportsOf(current, target);

	if (actor.guestId) {
		try {
			for (const exportId of exportIds) requireMarkers(await readExport(exportId, shareToken));
		} catch {
			return false;
		}
		// Only their own markers, which never leave the link's export
		return [...now.values(), ...wanted.values()].every((m) => m.guestId === actor.guestId);
	}

	const checks = new Map<
		string,
		{ allowed: Awaited<ReturnType<typeof accessChecker>>; projectId: string; timelineId: string }
	>();
	for (const exportId of exportIds) {
		try {
			const { member, target: t } = await authorize("export", "read", {
				type: "export",
				id: exportId,
			});
			checks.set(exportId, {
				allowed: await accessChecker(member),
				projectId: t.projectId!,
				timelineId: t.timelineId!,
			});
		} catch {
			return false;
		}
	}
	const may = (action: "create" | "update" | "delete", m: MarkerStateEntry) => {
		const check = checks.get(m.exportId)!;
		return check.allowed("marker", action, {
			projectId: check.projectId,
			timelineId: check.timelineId,
			ownerId: action === "create" ? null : m.authorId,
		});
	};
	return scope.every((id) => {
		const a = now.get(id);
		const b = wanted.get(id);
		if (a && !b) return may("delete", a);
		// Bringing back someone else's marker is more than adding one: it needs their markers too
		if (!a && b) return may("create", b) && may("update", b);
		if (!a || !b) return true;
		if (a.exportId !== b.exportId) return may("delete", a) && may("create", b);
		return conflictingMarkers([id], current, target, target).length === 0 || may("update", a);
	});
}

/**
 * Takes the scope's markers from `current` to `target`: deletes what isn't in it, gives the
 * others their fields and export back and recreates deleted ones with their responses and
 * pointers. Responses and pointers of markers that stay are left alone.
 */
async function applyState(tx: Tx, scope: string[], current: MarkerState, target: MarkerState) {
	const now = new Map(current.markers.map((m) => [m.id, m]));
	const wanted = new Map(target.markers.map((m) => [m.id, m]));

	const gone = scope.filter((id) => now.has(id) && !wanted.has(id));
	if (gone.length > 0) await deleteMarkersRecorded(tx, { id: { in: gone } });

	const exports = await tx.export.findMany({
		where: { id: { in: exportsOf(target) } },
		select: { id: true, timeline: { select: { projectId: true } } },
	});
	const projectOf = new Map(exports.map((e) => [e.id, e.timeline.projectId]));
	const resolvers = new Map<string, Awaited<ReturnType<typeof categoryResolver>>>();
	const categoryOf = async (m: MarkerStateEntry) => {
		const projectId = projectOf.get(m.exportId);
		if (!projectId) error(409, "The export of a marker is gone");
		let resolve = resolvers.get(projectId);
		if (!resolve) resolvers.set(projectId, (resolve = await categoryResolver(tx, projectId)));
		return resolve(m);
	};

	const users = await existingIds(
		target.markers.flatMap((m) => [m.authorId, ...m.responses.map((r) => r.authorId)]),
		(ids) => tx.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
	);
	const guests = await existingIds(
		target.markers.map((m) => m.guestId),
		(ids) => tx.shareGuest.findMany({ where: { id: { in: ids } }, select: { id: true } }),
	);
	const user = (id: string | null) => (id && users.has(id) ? id : null);

	for (const m of target.markers) {
		const content = {
			name: m.name,
			description: m.description,
			frame: m.frame,
			duration: m.duration,
			categoryId: await categoryOf(m),
		};
		const existing = now.get(m.id);
		if (existing && existing.exportId === m.exportId) {
			await tx.marker.update({ where: { id: m.id }, data: content });
			continue;
		}
		if (existing) {
			// A cut moved it, or its undo: it leaves one export's NLE timeline for another one's
			const link = await arrive(tx, m.id, m.exportId);
			await leave(tx, existing);
			await tx.marker.update({
				where: { id: m.id },
				data: { ...content, exportId: m.exportId, ...link },
			});
			continue;
		}
		await tx.marker.create({
			data: {
				id: m.id,
				...content,
				exportId: m.exportId,
				...(await arrive(tx, m.id, m.exportId)),
				createdAt: new Date(m.createdAt),
				authorId: user(m.authorId),
				guestId: m.guestId && guests.has(m.guestId) ? m.guestId : null,
				responses: {
					create: m.responses.map((r) => ({
						id: r.id,
						content: r.content,
						authorId: user(r.authorId),
						createdAt: new Date(r.createdAt),
					})),
				},
				pointers: {
					create: m.pointers.map((p) => ({
						id: p.id,
						kind: p.kind,
						x: p.x,
						y: p.y,
						width: p.width,
						height: p.height,
						color: p.color,
						createdAt: new Date(p.createdAt),
					})),
				},
			},
		});
	}
}

const unlinked = { nleId: null, nleTimelineId: null, syncHash: null };

/**
 * The NLE link a marker gets when it comes (back) into an export. Its DeletedMarker row there
 * tells: the row is still there while no pull removed the marker from the NLE, so it is still
 * in it and keeps its link. Without the row a pull removed it, and an unlinked marker makes the
 * next pull add it again, instead of taking it for deleted in the NLE.
 */
export async function arrive(tx: Tx, markerId: string, exportId: string) {
	const row = await tx.deletedMarker.findUnique({ where: { markerId } });
	if (!row || row.exportId !== exportId) return unlinked;
	await tx.deletedMarker.delete({ where: { markerId } });
	if (!row.nleId) return unlinked;
	// The NLE id is unique per export and may sit on another marker by now
	const taken = await tx.marker.count({ where: { exportId, nleId: row.nleId } });
	if (taken > 0) return unlinked;
	return { nleId: row.nleId, nleTimelineId: row.nleTimelineId, syncHash: row.syncHash };
}

/**
 * A marker moved out of an export counts as deleted there, so a pull removes it from that NLE
 * timeline. Only needed when it was in one.
 */
export async function leave(
	tx: Tx,
	m: Pick<MarkerStateEntry, "id" | "exportId" | "nleId" | "nleTimelineId" | "syncHash">,
) {
	if (!m.nleId && !m.nleTimelineId) return;
	const data = {
		exportId: m.exportId,
		nleId: m.nleId,
		nleTimelineId: m.nleTimelineId,
		syncHash: m.syncHash,
		deletedAt: new Date(),
	};
	await tx.deletedMarker.upsert({
		where: { markerId: m.id },
		create: { markerId: m.id, ...data },
		update: data,
	});
}
