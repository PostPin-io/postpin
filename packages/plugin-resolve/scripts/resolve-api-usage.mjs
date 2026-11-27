#!/usr/bin/env node
// Prints every Resolve API call the plugin makes, one "Class.Method" per line, sorted.
//
// Usage: node scripts/resolve-api-usage.mjs
//
// Uses the TypeScript checker on src/electron, so a call counts by the type of the object it's made
// on (Timeline.GetName and Project.GetName are separate entries). Only calls on interfaces declared
// in src/electron/resolve.ts count; WorkflowIntegrationModule is reported as WorkflowIntegration.
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typesFile = path.join(root, "src/electron/resolve.ts");

const configPath = path.join(root, "tsconfig.electron.json");
const config = ts.getParsedCommandLineOfConfigFile(
	configPath,
	{},
	{
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (d) => {
			throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
		},
	},
);
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();

// The Resolve interfaces a type stands for, ignoring null and undefined in a union
function resolveInterfaces(type) {
	const parts = type.isUnion() ? type.types : [type];
	return parts.flatMap((part) => {
		const symbol = part.getSymbol() ?? part.aliasSymbol;
		const declaredIn = symbol?.declarations?.[0]?.getSourceFile().fileName;
		if (!declaredIn || path.resolve(declaredIn) !== typesFile) return [];
		const name = symbol.getName();
		return [name === "WorkflowIntegrationModule" ? "WorkflowIntegration" : name];
	});
}

const used = new Set();
for (const sourceFile of program.getSourceFiles()) {
	const file = path.resolve(sourceFile.fileName);
	if (!file.startsWith(path.join(root, "src/electron")) || file === typesFile) continue;
	const visit = (node) => {
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const receiver = checker.getTypeAtLocation(node.expression.expression);
			for (const name of resolveInterfaces(receiver)) {
				used.add(`${name}.${node.expression.name.text}`);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
}

console.log([...used].sort().join("\n"));
