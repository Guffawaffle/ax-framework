import { runTimedWait } from "../../../src/wait/timed.js";

export default function waitTimed(args, resolved, ctx) {
  return runTimedWait(args, resolved, ctx);
}
