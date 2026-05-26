import { cronJobs } from "convex/server";
import { internal } from "../_generated/api";

const crons = cronJobs();

crons.interval(
  "run due scheduled workflows",
  { minutes: 5 },
  internal.workflows.scheduling.runDueWorkflows
);

export default crons;
