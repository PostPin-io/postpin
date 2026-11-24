/** Positive feedback of the guides: a short "✓ …" after a step that worked, see docs/guides/ */
import type { GuideType } from "#lib/guides.ts";

export const guideFeedback = $state<{
	message: { id: number; text: string; type: GuideType } | null;
}>({ message: null });

let nextId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showGuideFeedback(text: string, type: GuideType, ms = 3500) {
	const id = ++nextId;
	guideFeedback.message = { id, text, type };
	clearTimeout(timer);
	timer = setTimeout(() => {
		if (guideFeedback.message?.id === id) guideFeedback.message = null;
	}, ms);
}
