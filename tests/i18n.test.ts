import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@formatjs/icu-messageformat-parser";
import { LOCALES, NAMESPACES, resolveLocale } from "../i18n/config.ts";

type Tree = { [key: string]: string | Tree };

function load(locale: string, namespace: string): Tree {
  return JSON.parse(readFileSync(new URL(`../messages/${locale}/${namespace}.json`, import.meta.url), "utf8")) as Tree;
}

/** Chiavi foglia, es. "welcome.features.coach.title". */
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

/** Segnaposto e tag di un messaggio ICU (anche dentro plurali e select); fallisce se la sintassi è rotta. */
function placeholders(text: string): string {
  const names = new Set<string>();
  const walk = (nodes: IcuNode[]) => {
    for (const node of nodes) {
      // 0 testo, 7 "#": niente. 1 argomento, 2-4 numero/data/ora, 5 select, 6 plural, 8 tag.
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
  test(`i18n: ${namespace} ha le stesse chiavi e gli stessi segnaposto in tutte le lingue`, () => {
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

test("i18n: la lingua si sceglie da cookie, poi da Accept-Language, poi italiano", () => {
  assert.equal(resolveLocale("en", "it-IT"), "en");
  assert.equal(resolveLocale(undefined, "it-IT,it;q=0.9"), "it");
  assert.equal(resolveLocale(undefined, "en-GB,en;q=0.8"), "en");
  assert.equal(resolveLocale("fr", null), "it");
  assert.equal(resolveLocale(undefined, undefined), "it");
});
