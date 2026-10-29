import { migrationPlan } from "../server/db/migration-plan";
const plan = await migrationPlan();
console.log(
  JSON.stringify(
    {
      mode: "offline-plan-only",
      migrations: plan.map(({ sql: _, ...metadata }) => metadata),
      executed: false,
    },
    null,
    2,
  ),
);
