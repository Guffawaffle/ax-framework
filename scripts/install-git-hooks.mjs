import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const initialCwd = process.env.INIT_CWD
  ? path.resolve(process.env.INIT_CWD)
  : null;

// Hooks belong only to the checkout where npm was invoked. Package consumers
// and npm's transient dependency staging directories must remain untouched.
if (initialCwd !== sourceRoot || !existsSync(path.join(sourceRoot, ".git"))) {
  console.log("[INFO] Skipping git hooks outside the active AXF checkout");
} else {
  let hooks;
  try {
    hooks = (await import("simple-git-hooks")).default;
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    console.log("[INFO] Skipping git hooks because simple-git-hooks is unavailable");
  }
  if (hooks && !hooks.skipInstall()) {
    await hooks.setHooksFromConfig(sourceRoot, process.argv.slice(2));
    console.log("[INFO] Successfully set all git hooks");
  }
}
