/** Why the guest category can't be deleted or renamed, shown wherever that matters. */
export const GUEST_CATEGORY_REASONS = [
	"Markers created by people who use a share link are placed in it automatically.",
	"It's created automatically for every project and has to stay available, so it can't be deleted.",
	'Its name is always "Guest", so it can\'t be renamed. Its color can be changed.',
] as const;
