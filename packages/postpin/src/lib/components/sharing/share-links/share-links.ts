import {
	DEFAULT_SHARE_LINK_PRESET,
	shareLinkPath,
	type ShareLinkPreset,
	type ShareLinkStatus,
} from "@postpin-io/shared/logic/share-links";
import type { getShareLinks } from "./share-links.remote";

/** One link as getShareLinks returns it */
export type ShareLinkRow = Awaited<ReturnType<typeof getShareLinks>>[number];

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
/** The URL without its scheme, as the list shows it */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

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
export function formatLastViewed(lastViewedAt: Date | null, now = new Date()) {
	if (!lastViewedAt) return "Not opened yet";
	const minutes = Math.round((now.getTime() - lastViewedAt.getTime()) / 60_000);
	if (minutes < 1) return "Opened just now";
	if (minutes < 60) return `Opened ${relative.format(-minutes, "minute")}`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `Opened ${relative.format(-hours, "hour")}`;
	return `Opened ${relative.format(-Math.round(hours / 24), "day")}`;
}

export const formatViews = (visits: number, guests: number) =>
	`${visits} visit${visits === 1 ? "" : "s"} · ${guests} guest${guests === 1 ? "" : "s"}`;

/** Active links on top, expired ones apart (greyed out, still renewable); revoked ones not at all */
export function partitionLinks<T extends { status: ShareLinkStatus }>(links: T[]) {
	return {
		active: links.filter((l) => l.status === "active"),
		expired: links.filter((l) => l.status === "expired"),
	};
}
/** The list order: active links first, then the expired ones (greyed out, still renewable) */
export function orderedLinks<T extends { status: ShareLinkStatus }>(links: T[]) {
	const { active, expired } = partitionLinks(links);
	return [...active, ...expired];
}

const HOUR_MS = 60 * 60 * 1000;

/** The expiry chip: hours below a day (and then a warning), days above, "expired" after */
export function remainingTime(expiresAt: Date, now = new Date()) {
	const ms = expiresAt.getTime() - now.getTime();
	if (ms <= 0) return { text: "expired", warn: true };
	const hours = ms / HOUR_MS;
	return hours < 24
		? { text: `${Math.ceil(hours)}h`, warn: true }
		: { text: `${Math.floor(hours / 24)}d`, warn: false };
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
