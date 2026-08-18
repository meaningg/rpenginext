/**
 * Root entry — prefer host scripts: `bun run cli`, `bun run api`, `bun run web`.
 */
import { createLogger } from "@rpengineext/logger";
import { CORE_VERSION } from "@rpengineext/core";
import { CONTRACTS_VERSION } from "@rpengineext/contracts";

const log = createLogger({
  name: "rpengineext",
  level: "info",
  json: false,
  bindings: { component: "root" },
});

log.info(
  { coreVersion: CORE_VERSION, contractsVersion: CONTRACTS_VERSION },
  "rpengineext — run: bun run cli | bun run api | bun run web",
);
