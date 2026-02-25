# Skymark Flight History Fetcher

Fetch and display Skymark Airlines flight history from MyPage for 確定申告 (tax filing).

## Usage

```bash
# Full run: fetch from Skymark + parse + display
cd scripts && PYTHONPATH=src python3 -m skymark --year 2025 --data-dir ../fetched

# Re-parse only (no network, instant): uses cached HTML in fetched/raw/html/
cd scripts && PYTHONPATH=src python3 -m skymark --parse-only --year 2025 --data-dir ../fetched

# Custom cookie file
cd scripts && PYTHONPATH=src python3 -m skymark --cookie ../other.json --year 2024 --data-dir ../fetched

# Or after `pip install -e scripts/`:
skymark --year 2025 --data-dir fetched
```

## Prerequisites

- `cookie.json` in project root, exported from browser (EditThisCookie extension)
- Cookies must include a valid Cognito refresh token (~30 days validity)
- Python 3.10+

## Output Structure

```
fetched/
├── raw/
│   ├── flight_list.json          # API response (all reservations)
│   └── html/
│       ├── SB2GU4.html           # Full reservation page per PNR
│       ├── SBGE39.html
│       └── ...
├── parsed_2025.json              # Structured data (all fields extracted)
├── flight_history_2025.csv       # CSV for Excel
└── flight_history_2025.html      # Self-contained HTML report
```

## Parsed Fields (per reservation)

From JS variables: `ticket_id`, `order_id`, `user_id`, `email`, `lastname_alphabet`, `firstname_alphabet`, `lastname_kanji`, `firstname_kanji`, `gender`, `age`, `phone_number`, `phone_contact`

From payment section: `total`, `payment_status`, `payment_methods[]`

From fees section: `fees[]` with `type`, `unit_price`, `quantity`, `subtotal`
  - Types: 手荷物料金等, 座席指定料金, 払戻手数料, 取消手数料, その他

From flight table: `flights[]` with `date`, `flight`, `aircraft`, `dep`, `dep_time`, `arr`, `arr_time`, `fare_type`, `res_no`

From passenger table: `passengers[]` with `type`, `name`, `age`, `gender`, `fares[]` (each: `flight`, `fare_type`, `amount`, `seat`, `seat_fee`)

From cancelled section: `cancelled_flights[]`

From contact section: `contact_phone`, `contact_phone_type`, `contact_email`

## Architecture

Source files in `scripts/src/skymark/`:

1. **fetch.py** (`run_fetch`): HTTP requests only, saves raw HTML/JSON to `fetched/raw/`
2. **parse.py** (`run_parse`): Reads raw files from disk, extracts all fields, saves `parsed_<year>.json`
3. **present.py**: Table, monthly summary, fee breakdown, CSV/HTML export
4. **__main__.py**: CLI entrypoint, wires layers together

Key: Fetch saves everything raw so parse can be re-run instantly without network access.

## API Details

- **Cognito refresh**: `cognito-idp.ap-northeast-1.amazonaws.com` with `REFRESH_TOKEN_AUTH` + `DEVICE_KEY`
- **Flight list**: POST `d3ks8eh4veag7k.cloudfront.net/mypageapi/reservedflightlist` with `{idToken, action: 2}`
- **Reservation detail**: POST `www.res.skymark.co.jp/reserve2/main` with `{request: mypage, pnrId, secondname, firstname}`
  - Requires fresh HTTP opener per request (Akamai bot protection)
  - 1 second delay between requests
