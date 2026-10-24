export function formatMegabytes(bytes: number) {
	return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function formatDuration(ms: number) {
	const seconds = Math.round(ms / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// codes are 8 characters, shown as "ABCD-EFGH" like on the website
export function formatLoginCode(code: string) {
	return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
