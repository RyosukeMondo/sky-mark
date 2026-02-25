# Sky-Mark Project

Skymark Airlines flight history extractor for 確定申告 (Japanese tax filing).

## Project Structure

```
sky-mark/
├── scripts/                  # Python package (stdlib-only)
│   ├── pyproject.toml
│   └── src/skymark/
│       ├── __main__.py       # CLI entrypoint
│       ├── fetch.py          # HTTP requests, saves raw HTML/JSON
│       ├── parse.py          # Structured data extraction from raw files
│       └── present.py        # Table display, CSV/HTML export
├── extensions/               # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js            # Token extraction + API calls on Skymark pages
│   ├── background.js         # Service worker, storage routing
│   ├── options.html/js/css   # Results display + export
│   └── icons/
├── docs/
│   └── api-reference.md      # Skymark API docs (from reverse-engineered JS)
├── fetched/                  # Output data (gitignored)
│   ├── raw/{flight_list.json, html/*.html}
│   ├── parsed_YYYY.json
│   ├── flight_history_YYYY.csv
│   └── flight_history_YYYY.html
└── cookie.json               # Browser cookies (gitignored)
```

## Quick Start

```bash
# From project root:
cd scripts && PYTHONPATH=src python3 -m skymark --parse-only --year 2025 --data-dir ../fetched

# Or install as package:
pip install -e scripts/
skymark --year 2025 --data-dir fetched
```

## CLI Options

```
--cookie PATH     Cookie JSON file (default: cookie.json)
--year YYYY       Target year (default: 2025)
--delay SEC       Delay between requests (default: 1.0)
--parse-only      Skip fetch, re-parse from raw/
--data-dir PATH   Data directory (default: fetched)
```

## Key APIs

- Cognito token refresh: `cognito-idp.ap-northeast-1.amazonaws.com`
- Flight list: `d3ks8eh4veag7k.cloudfront.net/mypageapi/reservedflightlist`
- Reservation detail: `www.res.skymark.co.jp/reserve2/main` (needs fresh opener per request)
