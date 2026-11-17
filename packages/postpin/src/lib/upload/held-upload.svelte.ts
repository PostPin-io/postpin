// A video dropped where it can't go yet (the projects or the timelines): it is held here while
// the user chooses the timeline, and the timeline's export list opens the upload with it.
// Only set from browser events, so the server never holds one.

class HeldUpload {
	file = $state<File | null>(null);

	hold(file: File) {
		this.file = file;
	}

	/** The held video, handed over to the upload, which owns it from then on */
	take() {
		const file = this.file;
		this.file = null;
		return file;
	}

	clear() {
		this.file = null;
	}
}

export const heldUpload = new HeldUpload();
