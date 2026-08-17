import { describe, expect, it } from "vitest";

import {
  extractPlansArray,
  generateIndexNowKey,
  schemaFor,
  slugify,
  validateSlug,
} from "@/scripts/init-launch";

describe("slugify", () => {
  it("derives a slug from a human name", () => {
    expect(slugify("Test #1 Repo")).toBe("test-1-repo");
  });

  it("collapses punctuation and whitespace runs into single hyphens", () => {
    expect(slugify("My   Great -- Idea!!")).toBe("my-great-idea");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("...Hello...")).toBe("hello");
  });

  it("lowercases", () => {
    expect(slugify("LOUD Name")).toBe("loud-name");
  });

  it("truncates without leaving a trailing hyphen", () => {
    const slug = slugify("a".repeat(40) + " b");
    expect(slug.length).toBeLessThanOrEqual(32);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    for (const slug of ["test-1-repo", "abc", "a1b2c3", "my-launch-2026"]) {
      expect(validateSlug(slug)).toBeNull();
    }
  });

  it("rejects slugs that are too short", () => {
    expect(validateSlug("ab")).not.toBeNull();
  });

  it("rejects slugs that are too long", () => {
    expect(validateSlug("a".repeat(33))).not.toBeNull();
  });

  it("rejects slugs not starting with a letter", () => {
    expect(validateSlug("1abc")).not.toBeNull();
    expect(validateSlug("-abc")).not.toBeNull();
  });

  it("rejects uppercase, underscores and spaces", () => {
    // The slug becomes a Postgres schema name and a PostHog property value;
    // anything outside this charset breaks one of them.
    expect(validateSlug("Test-Repo")).not.toBeNull();
    expect(validateSlug("test_repo")).not.toBeNull();
    expect(validateSlug("test repo")).not.toBeNull();
  });

  it("rejects a trailing hyphen", () => {
    expect(validateSlug("test-")).not.toBeNull();
  });
});

describe("schemaFor", () => {
  it("converts hyphens to underscores — Postgres schema names cannot contain hyphens", () => {
    expect(schemaFor("test-1-repo")).toBe("launch_test_1_repo");
  });

  it("leaves an already-underscore-safe slug alone", () => {
    expect(schemaFor("abc")).toBe("launch_abc");
  });
});

describe("generateIndexNowKey", () => {
  it("produces a key inside IndexNow's 8–128 hex-character requirement", () => {
    const key = generateIndexNowKey();
    expect(key).toMatch(/^[0-9a-f]+$/);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });

  it("is different each time", () => {
    expect(generateIndexNowKey()).not.toBe(generateIndexNowKey());
  });
});

/**
 * Regression cover for a real bug: launch.config.ts used to be rewritten with
 * regexes, and `integrations: {` matched the LaunchConfig *interface* before the
 * object literal — a non-greedy replace then swallowed the entire
 * `export const launchConfig` declaration and produced a file that did not
 * compile. The config is now generated, and the plans array is carried across
 * re-runs by bracket matching rather than a regex.
 */
describe("extractPlansArray", () => {
  const config = `export const launchConfig: LaunchConfig = {
  slug: "x",
  plans: [
    {
      key: "starter",
      features: ["a", "b"],
    },
  ],
};
`;

  it("extracts a balanced plans array including nested brackets", () => {
    const plans = extractPlansArray(config);
    expect(plans).not.toBeNull();
    expect(plans?.startsWith("[")).toBe(true);
    expect(plans?.endsWith("]")).toBe(true);
    expect(plans).toContain('key: "starter"');
    // The nested `features` array must not terminate the match early.
    expect(plans).toContain('features: ["a", "b"]');
  });

  it("does not run past the array into the rest of the file", () => {
    expect(extractPlansArray(config)).not.toContain("export const");
  });

  it("returns null when there is no plans array", () => {
    expect(extractPlansArray("export const launchConfig = { slug: 'x' };")).toBeNull();
  });

  it("returns null on an unterminated array rather than a truncated match", () => {
    expect(extractPlansArray('\n  plans: [\n    { key: "a" },\n')).toBeNull();
  });
});
