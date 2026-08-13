import { cronJobs } from "convex/server";
import { internal } from "../_generated/api";

const crons = cronJobs();

crons.interval(
  "run due account autopilots",
  { minutes: 5 },
  internal.accounts.autopilotScheduling.runDueAccountAutopilots
);

crons.interval(
  "refresh fal model prices",
  { hours: 6 },
  internal.providers.fal.pricing.syncRosterPrices
);

crons.hourly(
  "reconcile fal billing events",
  { minuteUTC: 35 },
  internal.providers.fal.billing.reconcileRecentBillingEvents
);

export default crons;
