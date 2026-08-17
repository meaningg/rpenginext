import { failure, type Failure, type Result, ok, err } from "@rpengineext/contracts";

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * Parses a bare semver string (pre-release ignored for range checks).
 *
 * @param version - e.g. 1.2.3
 */
export function parseSemver(version: string): Result<ParsedSemver, Failure> {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) {
    return err(failure("ENGINE_MISMATCH", `invalid semver: ${version}`));
  }
  return ok({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  });
}

function cmp(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Checks whether `version` satisfies a simple range used in module manifests.
 * Supported: exact `x.y.z`, caret `^x.y.z`, `>=x.y.z`, `*`.
 *
 * @param version - installed version
 * @param range - declared range
 */
export function satisfiesRange(
  version: string,
  range: string,
): Result<true, Failure> {
  const trimmed = range.trim();
  if (trimmed === "*" || trimmed === "x") {
    return ok(true);
  }

  const ver = parseSemver(version);
  if (!ver.ok) return ver;

  if (trimmed.startsWith("^")) {
    const base = parseSemver(trimmed.slice(1));
    if (!base.ok) return base;
    if (ver.value.major !== base.value.major) {
      return err(
        failure(
          "ENGINE_MISMATCH",
          `version ${version} does not satisfy ${range}`,
        ),
      );
    }
    if (cmp(ver.value, base.value) < 0) {
      return err(
        failure(
          "ENGINE_MISMATCH",
          `version ${version} does not satisfy ${range}`,
        ),
      );
    }
    return ok(true);
  }

  if (trimmed.startsWith(">=")) {
    const base = parseSemver(trimmed.slice(2).trim());
    if (!base.ok) return base;
    if (cmp(ver.value, base.value) < 0) {
      return err(
        failure(
          "ENGINE_MISMATCH",
          `version ${version} does not satisfy ${range}`,
        ),
      );
    }
    return ok(true);
  }

  const exact = parseSemver(trimmed);
  if (!exact.ok) return exact;
  if (cmp(ver.value, exact.value) !== 0) {
    return err(
      failure(
        "ENGINE_MISMATCH",
        `version ${version} does not satisfy ${range}`,
      ),
    );
  }
  return ok(true);
}
