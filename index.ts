/**
 * Root scaffold entry — prefer `bun run cli:hello` for the Phase 2 vertical slice.
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
  "rpengineext — run: bun run cli:hello",
);
