// The state of a marker in PostPin's terms, as both sides can tell it: the NLE's marker after
// mapping its tag or color to a category, PostPin's marker with its category's name. The server
// stores the hash of the state both sides agreed on at the last sync (Marker.syncHash), so a sync
// can tell which side changed a marker since.
export interface SyncState {
	name: string;
	description: string | null;
	frame: number;
	duration: number;
	categoryName: string;
}

export function syncHash({ name, description, frame, duration, categoryName }: SyncState) {
	return cyrb53(
		JSON.stringify([name, description ?? "", frame, duration, categoryName.toLowerCase()]),
	);
}

// A fast 53-bit string hash; collisions only make a sync see a change that isn't there
function cyrb53(text: string) {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
