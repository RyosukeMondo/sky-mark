# Sky-Mark

Skymark Airlines flight history extractor for 確定申告 (Japanese tax filing).

Extracts flight history, fare breakdowns, and fee summaries from Skymark's MyPage via their internal APIs. Outputs formatted tables, CSV, and HTML reports suitable for tax filing.

## Components

### `scripts/` — Python CLI

Stdlib-only Python package. Fetches raw data from Skymark APIs, parses reservation HTML, and exports reports.

```bash
cd scripts && PYTHONPATH=src python3 -m skymark --parse-only --year 2025 --data-dir ../fetched
```

See `scripts/` for full CLI options.

### `extensions/` — Chrome Extension

Manifest V3 browser extension that extracts flight history directly from Skymark MyPage without needing exported cookies. Load unpacked from `extensions/` in Chrome.

### `docs/` — API Reference

Reverse-engineered documentation of Skymark's authentication flow, API endpoints, and internal constants.

## Prerequisites

- Python 3.10+ (for CLI)
- Chrome/Chromium (for extension)
- Valid Skymark MyPage account
- `cookie.json` in project root for CLI usage (export from browser with EditThisCookie)

## Output

Reports are saved to `fetched/`:

```
fetched/
├── raw/                          # Cached API responses
├── parsed_2025.json              # Structured data
├── flight_history_2025.csv       # Excel-compatible CSV
└── flight_history_2025.html      # Printable HTML report
```
