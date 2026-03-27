"""CLI entrypoint for skymark flight history extractor."""

import argparse
import datetime
import sys
from pathlib import Path

from skymark.fetch import load_cookies, run_fetch
from skymark.parse import run_parse
from skymark.present import (
    export_csv,
    export_html,
    present_fees,
    present_monthly,
    present_table,
)


def main():
    parser = argparse.ArgumentParser(
        description="Skymark flight history for 確定申告",
    )
    parser.add_argument("--cookie", default="cookie.json", help="Cookie JSON file")
    parser.add_argument(
        "--year",
        default=str(datetime.date.today().year),
        help="Target year (default: current year)",
    )
    parser.add_argument(
        "--delay", type=float, default=1.0, help="Delay between requests (sec)",
    )
    parser.add_argument(
        "--parse-only", action="store_true", help="Skip fetch, re-parse from raw/",
    )
    parser.add_argument("--data-dir", default="fetched", help="Data directory")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    raw_dir = data_dir / "raw"

    try:
        # 1. Fetch (unless --parse-only)
        if not args.parse_only:
            print(f"Loading cookies from {args.cookie}...")
            cookies = load_cookies(args.cookie)
            run_fetch(cookies, args.year, raw_dir, delay=args.delay)
        else:
            print(f"Parse-only mode: reading from {raw_dir}/")

        # 2. Parse
        print(f"\nParsing {args.year} data...")
        reservations = run_parse(raw_dir, args.year)

        # 3. Present
        print()
        present_table(reservations, args.year)
        present_monthly(reservations)
        present_fees(reservations)
        export_csv(reservations, str(data_dir / f"flight_history_{args.year}.csv"))
        export_html(
            reservations, args.year,
            str(data_dir / f"flight_history_{args.year}.html"),
        )
    except (FileNotFoundError, ValueError) as e:
        print(f"\nError: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
