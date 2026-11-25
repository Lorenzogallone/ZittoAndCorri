import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { NAMESPACES, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";

async function loadMessages(locale: Locale) {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => [namespace, (await import(`../messages/${locale}/${namespace}.json`)).default] as const),
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
  return { locale, messages: await loadMessages(locale), timeZone: "Europe/Rome" };
});
