import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Exercise the actual TypeScript modules with Node's built-in test runner.
const cache = new Map();
function moduleURL(filename) {
  if (cache.has(filename)) return cache.get(filename);
  let js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  js = js.replace(/from (["'])([^"']+)\1/g, (_, quote, specifier) => {
    if (!specifier.startsWith("."))
      return `from ${JSON.stringify(import.meta.resolve(specifier === "next/link" ? "next/link.js" : specifier))}`;
    let target = path.resolve(path.dirname(filename), specifier);
    if (target.endsWith(".css"))
      return `from "data:text/javascript,export default { root: 'scoped-app' }"`;
    if (target.endsWith(".json")) {
      const data = `export default ${fs.readFileSync(target, "utf8")};`;
      return `from ${JSON.stringify(`data:text/javascript;base64,${Buffer.from(data).toString("base64")}`)}`;
    }
    target = [target, target + ".ts", target + ".tsx"].find((p) =>
      fs.existsSync(p),
    );
    return `from ${JSON.stringify(moduleURL(target))}`;
  });
  js += `\n//# sourceURL=${pathToFileURL(filename).href}`;
  const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  cache.set(filename, url);
  return url;
}
export const loadFile = (filename) =>
  import(
    moduleURL(filename instanceof URL ? fileURLToPath(filename) : filename)
  );
