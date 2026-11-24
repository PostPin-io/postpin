import { mount } from "svelte";
import App from "../src/ui/App.svelte";
import { PROGRAMS, demoFetch, demoHost, demoNle, type ProgramId } from "./demo";
import "./app.css";

// ?program=resolve | premiere | protools
const param = new URLSearchParams(location.search).get("program");
const program: ProgramId = param && param in PROGRAMS ? (param as ProgramId) : "resolve";

mount(App, {
	target: document.getElementById("app")!,
	props: { nle: demoNle(program), host: demoHost(), titleBarInset: false, fetch: demoFetch },
});
