import { databaseConfiguration } from "../server/config";
const result = databaseConfiguration();
console.log(
  JSON.stringify({
    ...result,
    connectionAttempted: false,
    migrationsExecuted: false,
    financialApi: "disabled",
  }),
);
process.exitCode = result.configured ? 0 : 1;
