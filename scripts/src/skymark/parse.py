"""Parse layer — structured data extraction from cached raw files.

Reads only from disk (raw_dir). No network calls.
"""

import json
import re
from pathlib import Path


def parse_flight_list_json(raw_dir: Path, year: str) -> list[dict]:
    """Parse flight list JSON, returns list of PNR records with flight summaries."""
    list_path = raw_dir / "flight_list.json"
    if not list_path.exists():
        raise FileNotFoundError(
            f"{list_path} not found. Run fetch first (without --parse-only) "
            f"or check --data-dir path."
        )
    with open(list_path, encoding="utf-8") as f:
        raw_list = json.load(f)

    records = []
    for item in raw_list:
        flights = []
        for fl in item["flight"]:
            if f"{year}年" not in fl["departure_year"]:
                continue
            flights.append({
                "date": f"{fl['departure_year']}{fl['departure_date']}",
                "flight_number": fl["flight_number"],
                "departure": fl["departure_airport"],
                "departure_time": fl["departure_time"],
                "arrival": fl["arrival_airport"],
                "arrival_time": fl["arrival_time"],
                "reservation_number": fl.get("reservation_number", ""),
                "board_seat": fl.get("board_seat", ""),
            })
        if flights:
            records.append({
                "pnr": item["pnr_id"],
                "id": item["id"],
                "lastname": item["lastname_alphabet"],
                "firstname": item["firstname_alphabet"],
                "price_status": item.get("price_status"),
                "flights": flights,
            })
    return records


def parse_reservation_html(html: str) -> dict:
    """Extract every available field from reservation detail HTML."""
    r = {}

    # ── JS variables (top of page) ──
    def js_var(name: str) -> str:
        m = re.search(rf"const\s+{name}\s*=\s*'([^']*)'", html)
        return m.group(1) if m else ""

    r["ticket_id"] = js_var("mpTicketId")
    r["order_id"] = js_var("mpOrderId")
    r["user_id"] = js_var("mpUserId")
    r["language"] = js_var("mpLanguage")
    r["email"] = js_var("mpMailAddress")
    r["lastname_alphabet"] = js_var("mpLastnameAlphabet")
    r["firstname_alphabet"] = js_var("mpFirstnameAlphabet")
    r["lastname_kanji"] = js_var("mpLastnameKanji")
    r["firstname_kanji"] = js_var("mpFirstnameKanji")
    r["gender"] = js_var("mpGender")
    r["age"] = js_var("mpAge")
    r["phone_number"] = js_var("mpPhoneNumber")
    r["phone_contact"] = js_var("mpPhoneContact")  # H=自宅/携帯, B=勤務先

    # ── Payment section ──
    r["total"] = 0
    m = re.search(r"totalAmount[^>]*>\s*([\d,]+)円", html, re.DOTALL)
    if m:
        r["total"] = int(m.group(1).replace(",", ""))

    r["payment_status"] = ""
    m = re.search(r"お支払い状態：</dt>\s*<dd>([^<]+)</dd>", html)
    if m:
        r["payment_status"] = m.group(1).strip()

    # Payment methods (can be multiple)
    r["payment_methods"] = []
    for m in re.finditer(r"お支払い方法：</dt>\s*<dd>([^<]+)</dd>", html):
        r["payment_methods"].append(m.group(1).strip())

    # ── Fees ──
    r["fees"] = []
    fee_items = re.findall(r"(?:>|\n)\s*([^\s<>][^<>]*?／[\d,]+円×\d+)", html)
    for fi in fee_items:
        m = re.match(r"(.+?)／([\d,]+)円×(\d+)", fi.strip())
        if m:
            unit = int(m.group(2).replace(",", ""))
            qty = int(m.group(3))
            r["fees"].append({
                "type": m.group(1).strip(),
                "unit_price": unit,
                "quantity": qty,
                "subtotal": unit * qty,
            })

    # ── Flights table (ご搭乗便情報) ──
    r["flights"] = []
    flight_rows = re.findall(
        r"<td>(\d{4}年\d+月\d+日\([^)]+\))</td>\s*"
        r"<td><p>(SKY\d+)</p>"
        r'(?:.*?title="([^"]*)")?'         # aircraft type
        r".*?</td>\s*"
        r'<td class="depAirport">([^<]+)</td>\s*'
        r"<td><p>(\d+:\d+)</p></td>\s*"
        r'<td class="arrAirport">([^<]+)</td>\s*'
        r"<td><p>(\d+:\d+)</p></td>\s*"
        r'<td class="fareText">'
        r"(?:<a[^>]*>)?([^<]+)(?:</a>)?"    # fare type
        r".*?</td>\s*"
        r'<td class="reserveNumber">(\d+)</td>',
        html, re.DOTALL,
    )
    for fr in flight_rows:
        r["flights"].append({
            "date": fr[0],
            "flight": fr[1],
            "aircraft": fr[2],       # e.g., "BOEING 737-800"
            "dep": fr[3],
            "dep_time": fr[4],
            "arr": fr[5],
            "arr_time": fr[6],
            "fare_type": fr[7].strip(),
            "res_no": fr[8],
        })

    # ── Cancelled flights (お取消便情報) ──
    r["cancelled_flights"] = []
    cancel_section = re.search(
        r"お取消便情報.*?</table>", html, re.DOTALL,
    )
    if cancel_section:
        cancel_rows = re.findall(
            r"<td>(\d{4}年\d+月\d+日\([^)]+\))</td>\s*"
            r"<td><p>(SKY\d+)</p>.*?</td>\s*"
            r'<td class="depAirport">([^<]+)</td>\s*'
            r"<td><p>(\d+:\d+)</p></td>\s*"
            r'<td class="arrAirport">([^<]+)</td>\s*'
            r"<td><p>(\d+:\d+)</p></td>",
            cancel_section.group(), re.DOTALL,
        )
        for cr in cancel_rows:
            r["cancelled_flights"].append({
                "date": cr[0], "flight": cr[1], "dep": cr[2],
                "dep_time": cr[3], "arr": cr[4], "arr_time": cr[5],
            })

    # ── Passengers / fare breakdown (お客様情報) ──
    r["passengers"] = []
    pax_section = re.search(r'id="resConf">(.*?)</table>', html, re.DOTALL)
    if pax_section:
        # Each passenger block: 大人1, 小児1, etc.
        pax_blocks = re.findall(
            r"<td[^>]*>(\w+\d+)</td>\s*"       # pax type: 大人1
            r"<td>([^<]+)</td>\s*"               # name
            r'<td[^>]*>(\d+)</td>\s*'            # age
            r'<td[^>]*>([^<]+)</td>\s*'          # gender
            r"<td[^>]*>\s*<ul>(.*?)</ul>",       # fare list
            pax_section.group(1), re.DOTALL,
        )
        for pb in pax_blocks:
            pax_type = pb[0].strip()
            name = pb[1].replace("&nbsp;", " ").strip()
            age = pb[2].strip()
            gender = pb[3].strip()

            fares = []
            fare_lines = re.findall(
                r"<li>(SKY\d+)／(.*?)／([\d,]+)円／([^／]+)／([^<]+)</li>",
                pb[4],
            )
            for fl in fare_lines:
                fares.append({
                    "flight": fl[0],
                    "fare_type": re.sub(r"<[^>]+>", "", fl[1]).strip(),
                    "amount": int(fl[2].replace(",", "")),
                    "seat": fl[3].strip(),
                    "seat_fee": fl[4].strip(),
                })

            r["passengers"].append({
                "type": pax_type,
                "name": name,
                "age": int(age) if age.isdigit() else age,
                "gender": gender,
                "fares": fares,
            })

    # ── Contact info (ご連絡先) ── (from HTML table, not JS vars)
    contact_section = re.search(r'id="resConf2">(.*?)</table>', html, re.DOTALL)
    if contact_section:
        m = re.search(
            r'class="tdc">(\d+)<br\s*/?>.*?(\S+／\S+)',
            contact_section.group(1), re.DOTALL,
        )
        if m:
            r["contact_phone"] = m.group(1)
            r["contact_phone_type"] = m.group(2).strip()
        m = re.search(
            r'class="tdc">\s*\n?\s*\n?\s*([^\s<]+@[^\s<]+)',
            contact_section.group(1),
        )
        if m:
            r["contact_email"] = m.group(1).strip()

    return r


def run_parse(raw_dir: Path, year: str) -> list[dict]:
    """Parse all raw data from disk into structured reservations."""
    # 1. Parse flight list
    flight_records = parse_flight_list_json(raw_dir, year)

    # 2. Parse each reservation HTML
    html_dir = raw_dir / "html"
    reservations = []

    for rec in flight_records:
        pnr = rec["pnr"]
        html_path = html_dir / f"{pnr}.html"

        if not html_path.exists():
            print(f"  WARN: {html_path} not found, skipping")
            continue

        html = html_path.read_text(encoding="utf-8")
        detail = parse_reservation_html(html)
        detail["pnr"] = pnr
        reservations.append(detail)

    # 3. Save parsed JSON
    parsed_path = raw_dir.parent / f"parsed_{year}.json"
    with open(parsed_path, "w", encoding="utf-8") as f:
        json.dump(reservations, f, ensure_ascii=False, indent=2)
    print(f"Parsed data saved: {parsed_path} ({len(reservations)} reservations)")

    return reservations
