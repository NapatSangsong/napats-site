import th from "./th.json";
import en from "./en.json";

export type Locale = "th" | "en";

const dictionaries: Record<Locale, Record<string, string>> = { th, en };

export function t(key: string, locale: Locale = "th"): string {
	return dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
}

export function useT(locale: Locale = "th") {
	return (key: string) => t(key, locale);
}
