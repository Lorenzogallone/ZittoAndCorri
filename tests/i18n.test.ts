import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@formatjs/icu-messageformat-parser";
import { LOCALES, NAMESPACES, resolveLocale } from "../i18n/config.ts";

type Tree = { [key: string]: string | Tree };

function load(locale: string, namespace: string): Tree {
  return JSON.parse(readFileSync(new URL(`../messages/${locale}/${namespace}.json`, import.meta.url), "utf8")) as Tree;
}

/** Leaf keys, e.g. "welcome.features.coach.title". */
function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

type IcuNode = { type: number; value?: string; options?: Record<string, { value: IcuNode[] }>; children?: IcuNode[] };

/** Placeholders and tags of an ICU message (also inside plural and select); fails if the syntax is broken. */
function placeholders(text: string): string {
  const names = new Set<string>();
  const walk = (nodes: IcuNode[]) => {
    for (const node of nodes) {
      // 0 text, 7 "#": nothing. 1 argument, 2-4 number/date/time, 5 select, 6 plural, 8 tag.
      if (node.type === 8) names.add(`<${node.value}>`);
      else if (node.type >= 1 && node.type <= 6) names.add(String(node.value));
      if (node.options) for (const option of Object.values(node.options)) walk(option.value);
      if (node.children) walk(node.children);
    }
  };
  walk(parse(text) as unknown as IcuNode[]);
  return [...names].sort().join(",");
}

for (const namespace of NAMESPACES) {
  test(`i18n: ${namespace} has the same keys and placeholders in all languages`, () => {
    const [reference, ...others] = LOCALES.map((locale) => ({ locale, keys: leaves(load(locale, namespace)) }));
    for (const other of others) {
      assert.deepEqual([...other.keys.keys()].sort(), [...reference.keys.keys()].sort(), `${namespace}: chiavi diverse tra ${reference.locale} e ${other.locale}`);
      for (const [key, text] of reference.keys) {
        assert.equal(placeholders(other.keys.get(key) ?? ""), placeholders(text), `${namespace}.${key}: segnaposto diversi`);
        assert.ok((other.keys.get(key) ?? "").trim(), `${namespace}.${key}: traduzione vuota`);
      }
    }
  });
}

test("i18n: the language is chosen from cookie, then Accept-Language, then Italian", () => {
  assert.equal(resolveLocale("en", "it-IT"), "en");
  assert.equal(resolveLocale(undefined, "it-IT,it;q=0.9"), "it");
  assert.equal(resolveLocale(undefined, "en-GB,en;q=0.8"), "en");
  assert.equal(resolveLocale("fr", null), "it");
  assert.equal(resolveLocale(undefined, undefined), "it");
});

test("i18n: every coach prompt gets the language rule, empty in Italian", () => {
  // lib/ai/prompt.ts imports with the "@/" alias: here we check the source.
  const source = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  assert.match(source, /if \(locale === DEFAULT_LOCALE\) return "";/);
  assert.equal((source.match(/languageRule\(locale\),/g) ?? []).length, 3);
  for (const builder of ["buildEvaluationPrompt", "buildPlanPrompt", "buildCoachPrompt"]) {
    const start = source.indexOf(`export function ${builder}`);
    assert.ok(source.slice(start, start + 600).includes("locale: Locale = DEFAULT_LOCALE"), `${builder} senza locale`);
  }
});
