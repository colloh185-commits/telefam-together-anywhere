import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

export type Country = { code: CountryCode; name: string; dial: string; flag: string };

function flagEmoji(code: string) {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

let list: Country[] | null = null;

export function getCountryList(): Country[] {
  if (list) return list;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = null;
  }
  list = getCountries()
    .map((code) => ({
      code,
      name: names?.of(code) ?? code,
      dial: `+${getCountryCallingCode(code)}`,
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/** Best guess for the user's country from their time zone / language. */
export function guessCountry(): CountryCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const map: Record<string, CountryCode> = {
      "Africa/Nairobi": "KE", "Africa/Kampala": "UG", "Africa/Dar_es_Salaam": "TZ", "Africa/Lagos": "NG",
      "Africa/Johannesburg": "ZA", "Africa/Cairo": "EG", "Africa/Kigali": "RW", "Africa/Addis_Ababa": "ET",
      "Africa/Accra": "GH", "Europe/London": "GB", "America/New_York": "US", "America/Chicago": "US",
      "America/Los_Angeles": "US", "Asia/Kolkata": "IN", "Asia/Dubai": "AE", "Europe/Berlin": "DE",
      "Europe/Paris": "FR", "America/Toronto": "CA", "Australia/Sydney": "AU",
    };
    if (map[tz]) return map[tz];
    const region = navigator.language.split("-")[1]?.toUpperCase();
    if (region && (getCountries() as string[]).includes(region)) return region as CountryCode;
  } catch {
    /* ignore */
  }
  return "KE";
}
