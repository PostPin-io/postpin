/** Hands a file to the browser's download */
export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	// Some browsers start the download only after the click handler returned
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A name every file system accepts */
export function safeFileName(name: string) {
	const cleaned = name
		// eslint-disable-next-line no-control-regex -- control characters are what it removes
		.replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || "export";
}
