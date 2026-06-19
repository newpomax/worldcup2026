"""
Debug: print the first 2 selections from each knockout endpoint to check field names.
"""
import requests, json

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://sportsbook.draftkings.com/",
    "Origin": "https://sportsbook.draftkings.com",
    "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "Connection": "keep-alive",
}

ENDPOINTS = {
    "round_of_16": (
        "https://sportsbook-nash.draftkings.com/sites/US-SB/api/sportscontent/"
        "controldata/league/leagueSubcategory/v1/markets"
        "?isBatchable=false&templateVars=209533%2C19823"
        "&eventsQuery=%24filter%3DleagueId%20eq%20%27209533%27%20AND%20"
        "clientMetadata%2FSubcategories%2Fany%28s%3A%20s%2FId%20eq%20%2719823%27%29"
        "&marketsQuery=%24filter%3DclientMetadata%2FsubCategoryId%20eq%20%2719823%27%20AND%20"
        "tags%2Fall%28t%3A%20t%20ne%20%27SportcastBetBuilder%27%29&include=Events&entity=events"
    ),
    "champion": (
        "https://sportsbook-nash.draftkings.com/sites/US-SB/api/sportscontent/"
        "controldata/league/leagueSubcategory/v1/markets"
        "?isBatchable=false&templateVars=209533%2C4529"
        "&eventsQuery=%24filter%3DleagueId%20eq%20%27209533%27%20AND%20"
        "clientMetadata%2FSubcategories%2Fany%28s%3A%20s%2FId%20eq%20%274529%27%29"
        "&marketsQuery=%24filter%3DclientMetadata%2FsubCategoryId%20eq%20%274529%27%20AND%20"
        "tags%2Fall%28t%3A%20t%20ne%20%27SportcastBetBuilder%27%29&include=Events&entity=events"
    ),
}

with requests.Session() as s:
    s.headers.update(HEADERS)
    s.get("https://sportsbook.draftkings.com/", timeout=10)

    for name, url in ENDPOINTS.items():
        print(f"\n{'='*60}\n{name}\n{'='*60}")
        r = s.get(url, timeout=15)
        data = r.json()
        sels = data.get("selections", [])
        print(f"Total selections: {len(sels)}")
        print("First 2 selections (full):")
        print(json.dumps(sels[:2], indent=2))
