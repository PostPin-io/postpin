import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
import Copy from "@lucide/svelte/icons/copy";
import DiamondPlus from "@lucide/svelte/icons/diamond-plus";
import Link from "@lucide/svelte/icons/link";
import Locate from "@lucide/svelte/icons/locate";
import MoveHorizontal from "@lucide/svelte/icons/move-horizontal";
import MessageSquareReply from "@lucide/svelte/icons/message-square-reply";
import Pause from "@lucide/svelte/icons/pause";
import Play from "@lucide/svelte/icons/play";
import Plus from "@lucide/svelte/icons/plus";
import Send from "@lucide/svelte/icons/send";
import type { Component } from "svelte";
import type { StepIcon } from "./tour.ts";

/** The icons step texts may show (`icon()` in tour.ts): the same ones as on the buttons */
export const STEP_ICON_COMPONENTS: Record<StepIcon, Component<{ class?: string }>> = {
	play: Play,
	pause: Pause,
	"diamond-plus": DiamondPlus,
	locate: Locate,
	"chevron-down": ChevronDown,
	"message-square-reply": MessageSquareReply,
	send: Send,
	plus: Plus,
	link: Link,
	copy: Copy,
	"move-horizontal": MoveHorizontal,
	"chevrons-up-down": ChevronsUpDown,
};
