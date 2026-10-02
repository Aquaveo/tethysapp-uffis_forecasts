/**
 * Translation helpers over the catalog Django serves at /i18n/js/.
 * Without that catalog (tests, a bare page) messages stay in English.
 * The names gettext and ngettext are what makemessages extracts.
 */

/**
 * Translate a message.
 * @param {string} message English text
 * @returns {string}
 */
export function gettext(message) {
  return globalThis.gettext ? globalThis.gettext(message) : message;
}

/**
 * Translate a message whose wording depends on a count.
 * @param {string} singular English text for one
 * @param {string} plural English text for many
 * @param {number} count
 * @returns {string}
 */
export function ngettext(singular, plural, count) {
  return globalThis.ngettext ? globalThis.ngettext(singular, plural, count) : count === 1 ? singular : plural;
}

/**
 * Fill %(name)s placeholders, the form translators keep in place.
 * @param {string} text
 * @param {Record<string, string|number>} values
 * @returns {string}
 */
export function fill(text, values) {
  return text.replace(/%\((\w+)\)s/g, (_, name) => String(values[name]));
}

/**
 * The page language, for number and date formatting. English uses
 * British dates: 24-hour clock, day before month.
 * @returns {string}
 */
export function locale() {
  const lang = globalThis.document?.documentElement.lang || "en";
  return lang === "en" ? "en-GB" : lang;
}

/**
 * Format a number in the page language.
 * @param {number} value
 * @returns {string}
 */
export function number(value) {
  return value.toLocaleString(locale());
}
