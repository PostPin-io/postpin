import * as v from "valibot";

/** Where an invitation or invite link leads to. No exports: those are shared via share links. */
export const InviteTarget = v.variant("type", [
	v.object({ type: v.literal("organization"), id: v.string() }),
	v.object({ type: v.literal("project"), id: v.string() }),
	v.object({ type: v.literal("timeline"), id: v.string() }),
]);
export type InviteTarget = v.InferOutput<typeof InviteTarget>;

/** The DB columns for a target; org-level = both null */
export const targetColumns = (target: InviteTarget) => ({
	projectId: target.type === "project" ? target.id : null,
	timelineId: target.type === "timeline" ? target.id : null,
});
