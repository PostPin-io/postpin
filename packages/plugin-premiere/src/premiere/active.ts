import { ppro } from "../host";

export async function getActive() {
	const project = await ppro.Project.getActiveProject();
	if (!project) throw new Error("No project open in Premiere Pro");
	const sequence = await project.getActiveSequence();
	if (!sequence) throw new Error("No sequence open in Premiere Pro");
	return { project, sequence };
}
