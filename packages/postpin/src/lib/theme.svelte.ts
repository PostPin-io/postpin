import { onMount } from "svelte";

export type ThemePreference = "system" | "light" | "dark";

// Also read by the inline script in app.html, which sets data-theme before the first paint
const STORAGE_KEY = "postpin-theme";
// daisyUI's base-100 of the light and dark theme, as in app.html
const LIGHT_BAR = "#ffffff";
const DARK_BAR = "#1d232a";

function readPreference(): ThemePreference {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "light" || stored === "dark") return stored;
	} catch {
		// storage blocked, e.g. in a private window
	}
	return "system";
}

const browser = typeof window !== "undefined";
// Read right away, not on mount: children mount before the layout that tracks the system theme
let preference = $state<ThemePreference>(browser ? readPreference() : "system");
let systemDark = $state(browser && matchMedia("(prefers-color-scheme: dark)").matches);

export const theme = {
	get preference() {
		return preference;
	},
	/** The theme actually shown, after resolving "system" */
	get isDark() {
		return preference === "dark" || (preference === "system" && systemDark);
	},
	set(value: ThemePreference) {
		preference = value;
		// daisyUI follows prefers-color-scheme without data-theme
		if (value === "system") document.documentElement.removeAttribute("data-theme");
		else document.documentElement.dataset.theme = value;
		// the browser bar color: app.html has one meta per color scheme
		for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
			const dark = value === "system" ? meta.media.includes("dark") : value === "dark";
			meta.content = dark ? DARK_BAR : LIGHT_BAR;
		}
		try {
			if (value === "system") localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, value);
		} catch {
			// not remembered, still applied for this page
		}
	},
};

/** Call once from the root layout: tracks changes of the system theme */
export function initTheme() {
	onMount(() => {
		const query = matchMedia("(prefers-color-scheme: dark)");
		const update = () => (systemDark = query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});
}
