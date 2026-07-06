import { cronJobs } from "convex/server";
import { internal } from "../_generated/api";

const crons = cronJobs();

crons.interval(
  "run due scheduled automations",
  { minutes: 5 },
  internal.automations.scheduling.runDueAutomations
);

export default crons;
