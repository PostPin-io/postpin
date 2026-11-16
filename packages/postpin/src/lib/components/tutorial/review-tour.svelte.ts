/**
 * The tutorial on the review page, shared between its card, the Share Guide button next to the breadcrumbs,
 * the sharing tour and the sharing dialog.
 */
export const reviewTour = $state<{
	/** The sharing tour is on offer: the header shows the Share Guide button */
	shareOffered: boolean;
	/** The sharing tour is open; set by the Share Guide button */
	shareOpen: boolean;
	/** The sharing dialog was opened from the tour: its section explains what to do there */
	hint: "share-link" | "invite-link" | null;
}>({ shareOffered: false, shareOpen: false, hint: null });
