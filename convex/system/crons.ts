import { cronJobs } from "convex/server";
import { internal } from "../_generated/api";

const crons = cronJobs();

crons.interval(
  "run due account autopilots",
  { minutes: 5 },
  internal.accounts.autopilotScheduling.runDueAccountAutopilots
);

export default crons;
