import {
	DEFAULT_SHARE_LINK_PRESET,
	shareLinkPath,
	type ShareLinkPreset,
	type ShareLinkStatus,
} from "@postpin-io/shared/logic/share-links";

export const PRESET_LABELS: Record<ShareLinkPreset, string> = {
	"24h": "24 hours",
	"7d": "7 days",
	"30d": "30 days",
};

export const STATUS_LABELS: Record<ShareLinkStatus, string> = {
	active: "Active",
	expired: "Expired",
	revoked: "Revoked",
};

export const shareLinkUrl = (origin: string, token: string) => origin + shareLinkPath(token);

/** What "Copy" puts on the clipboard: the note first, then the link */
export function clipboardText(url: string, note: string | null) {
	const text = note?.trim();
	return text ? `${text}\n\n${url}` : url;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatExpiry(expiresAt: Date, now = new Date()) {
	const ms = expiresAt.getTime() - now.getTime();
	if (ms <= 0) return "Expired";
	const minutes = Math.round(ms / 60_000);
	if (minutes < 60) return `Expires ${relative.format(minutes, "minute")}`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `Expires ${relative.format(hours, "hour")}`;
	return `Expires ${relative.format(Math.round(hours / 24), "day")}`;
}

// ─── Form ───────────────────────────────────────────────────────────────────

export type ShareLinkFormValues = {
	timelinePanelVisible: boolean;
	markerPanelVisible: boolean;
	note: string;
	/** null = keep the current expiry (editing only) */
	preset: ShareLinkPreset | null;
};

export const newLinkValues = (): ShareLinkFormValues => ({
	timelinePanelVisible: false,
	markerPanelVisible: true,
	note: "",
	preset: DEFAULT_SHARE_LINK_PRESET,
});

export const editLinkValues = (link: {
	timelinePanelVisible: boolean;
	markerPanelVisible: boolean;
	note: string | null;
}): ShareLinkFormValues => ({
	timelinePanelVisible: link.timelinePanelVisible,
	markerPanelVisible: link.markerPanelVisible,
	note: link.note ?? "",
	preset: null,
});

export const toCreateInput = (exportId: string, v: ShareLinkFormValues) => ({
	exportId,
	preset: v.preset ?? DEFAULT_SHARE_LINK_PRESET,
	timelinePanelVisible: v.timelinePanelVisible,
	markerPanelVisible: v.markerPanelVisible,
	note: v.note,
});

/** No preset → expiry stays as it is. An empty note clears it (the server turns "" into null). */
export const toUpdateInput = (id: string, v: ShareLinkFormValues) => ({
	id,
	timelinePanelVisible: v.timelinePanelVisible,
	markerPanelVisible: v.markerPanelVisible,
	note: v.note,
	...(v.preset && { preset: v.preset }),
});
