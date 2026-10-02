/**
 * Tests that the French and Spanish catalogs are complete and keep
 * every placeholder, so no viewer text silently falls back to English.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const APP = new URL("../tethysapp/uffis_forecasts/", import.meta.url).pathname;
const LANGUAGES = ["fr", "es"];
const DOMAINS = ["django", "djangojs"];

/**
 * Join a .po string and its continuation lines into one value.
 * @param {string[]} lines quoted parts
 * @returns {string}
 */
function unquote(lines) {
  return lines.map((line) => JSON.parse(line)).join("");
}

/**
 * Read a .po file into entries of msgid, plural and translations.
 * @param {string} path
 * @returns {{id: string, plural?: string, strings: string[], fuzzy: boolean}[]}
 */
function readCatalog(path) {
  const entries = [];
  for (const block of readFileSync(path, "utf8").split(/\n\n+/)) {
    const fields = {};
    let key = null;
    for (const line of block.split("\n")) {
      const field = line.match(/^(msgid|msgid_plural|msgstr(?:\[\d\])?) (".*")$/);
      if (field) {
        key = field[1];
        fields[key] = [field[2]];
      } else if (line.startsWith('"') && key) {
        fields[key].push(line);
      }
    }
    if (!fields.msgid) continue;
    const strings = Object.keys(fields).filter((k) => k.startsWith("msgstr")).map((k) => unquote(fields[k]));
    entries.push({ id: unquote(fields.msgid), plural: fields.msgid_plural && unquote(fields.msgid_plural), strings, fuzzy: /^#,.*fuzzy/m.test(block) });
  }
  return entries.filter((entry) => entry.id);
}

/**
 * The %(name)s placeholders in a message, sorted.
 * @param {string} text
 * @returns {string[]}
 */
function placeholders(text) {
  return [...text.matchAll(/%\((\w+)\)s/g)].map((m) => m[1]).sort();
}

/**
 * The literal first arguments of gettext and ngettext in the viewer's JS,
 * outside commented-out lines, which makemessages skips too.
 * @returns {string[]}
 */
function sourceMessages() {
  const dir = join(APP, "public/js");
  return readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "i18n.js").flatMap((file) => {
    const source = readFileSync(join(dir, file), "utf8").split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    return [...source.matchAll(/\bn?gettext\("((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
  });
}

for (const lang of LANGUAGES) {
  for (const domain of DOMAINS) {
    test(`${lang} ${domain} catalog is complete and keeps placeholders`, () => {
      for (const entry of readCatalog(join(APP, `locale/${lang}/LC_MESSAGES/${domain}.po`))) {
        assert.ok(!entry.fuzzy, `fuzzy: ${entry.id}`);
        for (const text of entry.strings) {
          assert.ok(text, `untranslated: ${entry.id}`);
          assert.deepEqual(placeholders(text), placeholders(entry.id), `placeholders differ: ${entry.id}`);
        }
      }
    });
  }

  test(`${lang} catalog covers every message in the viewer's JS`, () => {
    const ids = new Set(readCatalog(join(APP, `locale/${lang}/LC_MESSAGES/djangojs.po`)).map((entry) => entry.id));
    const missing = sourceMessages().filter((message) => !ids.has(message));
    assert.deepEqual(missing, [], "run makemessages -d djangojs and translate the new messages");
  });
}
