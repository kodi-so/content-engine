import { cronJobs } from "convex/server";

const crons = cronJobs();

// Workflow scheduling and provider sync jobs will be added once the runner and
// publishing adapters are implemented.

export default crons;
