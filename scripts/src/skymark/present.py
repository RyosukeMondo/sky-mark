"""Present layer — display and export. Takes structured data only."""

import csv
import html as html_mod
import re
import time


def present_table(reservations: list[dict], year: str):
    """Print formatted table for 確定申告."""
    print("=" * 145)
    print(f"  {year}年 スカイマーク搭乗履歴 （確定申告用）")
    if reservations and reservations[0].get("lastname_alphabet"):
        name = f"{reservations[0]['lastname_alphabet']} {reservations[0]['firstname_alphabet']}"
        print(f"  搭乗者: {name}")
    print("=" * 145)

    header = (
        f"{'#':>3} | {'搭乗日':<22} | {'便名':<8} | {'機材':<4} "
        f"| {'区間':<14} | {'運賃種別':<8} | {'運賃額':>10} | {'座席':>4} "
        f"| {'諸費用':>10} | {'予約合計':>10} | {'PNR':<8}"
    )
    print(header)
    print("-" * 145)

    flight_no = 0
    grand_total = 0
    res_count = 0

    for res in reservations:
        fees_total = sum(f["subtotal"] for f in res.get("fees", []))
        # flatten all fares from all passengers
        all_fares = []
        for pax in res.get("passengers", []):
            for fare in pax.get("fares", []):
                all_fares.append(fare)

        if not all_fares:
            continue

        first = True
        res_count += 1

        for fare in all_fares:
            flight_no += 1
            fi = next(
                (f for f in res["flights"] if f["flight"] == fare["flight"]),
                None,
            )
            date = fi["date"] if fi else ""
            aircraft = (fi.get("aircraft", "") or "")[:4]
            route = f"{fi['dep']}→{fi['arr']}" if fi else ""

            if first:
                fees_str = f"{fees_total:,}円" if fees_total else "-"
                total_str = f"{res['total']:,}円"
                pnr_str = res["pnr"]
                grand_total += res["total"]
                first = False
            else:
                fees_str = ""
                total_str = ""
                pnr_str = ""

            print(
                f"{flight_no:3} | {date:<22} | {fare['flight']:<8} | {aircraft:<4} "
                f"| {route:<14} | {fare['fare_type']:<8} | {fare['amount']:>9,}円 | {fare['seat']:>4} "
                f"| {fees_str:>10} | {total_str:>10} | {pnr_str:<8}"
            )

        # Show non-baggage fee breakdown
        special_fees = [
            f for f in res.get("fees", []) if f["type"] != "手荷物料金等"
        ]
        for sf in special_fees:
            print(
                f"{'':>3}   {'':>22}   {'':>8}   {'':>4} "
                f"  {'':>14}   {'':>8}   {'':>10}   {'':>4} "
                f"  └ {sf['type']}:{sf['unit_price']:,}円×{sf['quantity']}"
            )

    print("-" * 145)
    print(f"  合計: {flight_no}フライト / {res_count}予約  総額: {grand_total:,}円")


def present_monthly(reservations: list[dict]):
    """Print monthly breakdown."""
    monthly = {}
    for res in reservations:
        if not res.get("flights"):
            continue
        m = re.search(r"(\d+)月", res["flights"][0]["date"])
        if not m:
            continue
        month = int(m.group(1))
        if month not in monthly:
            monthly[month] = {"flights": 0, "amount": 0}
        fare_count = sum(len(p["fares"]) for p in res.get("passengers", []))
        monthly[month]["flights"] += fare_count
        monthly[month]["amount"] += res["total"]

    print(f"\n{'='*50}")
    print("  月別集計")
    print(f"{'='*50}")

    total_f = 0
    total_a = 0
    for month in sorted(monthly):
        d = monthly[month]
        total_f += d["flights"]
        total_a += d["amount"]
        print(f"  {month:2}月: {d['flights']:2}フライト  {d['amount']:>10,}円")

    print(f"  {'─'*40}")
    print(f"  合計: {total_f:2}フライト  {total_a:>10,}円")


def present_fees(reservations: list[dict]):
    """Print fee type breakdown."""
    fee_types = {}
    for res in reservations:
        for fee in res.get("fees", []):
            fee_types.setdefault(fee["type"], 0)
            fee_types[fee["type"]] += fee["subtotal"]

    fare_total = sum(
        f["amount"]
        for r in reservations
        for p in r.get("passengers", [])
        for f in p.get("fares", [])
    )

    print(f"\n{'='*50}")
    print("  費用種別集計")
    print(f"{'='*50}")
    print(f"  運賃合計:         {fare_total:>10,}円")
    for t, amount in sorted(fee_types.items(), key=lambda x: -x[1]):
        label = f"  {t}:"
        print(f"{label:<20}{amount:>10,}円")
    grand = sum(r["total"] for r in reservations)
    print(f"  {'─'*40}")
    print(f"  総合計:           {grand:>10,}円")


def export_csv(reservations: list[dict], path: str):
    """Export full detail to CSV."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "#", "PNR", "搭乗日", "便名", "機材", "出発地", "出発時間",
            "到着地", "到着時間", "運賃種別", "運賃額", "座席", "座席指定料金",
            "搭乗者種別", "搭乗者名", "年齢", "性別",
            "手荷物料金等", "座席指定料金(計)", "その他費用", "諸費用計", "予約合計",
            "支払状態", "支払方法",
            "電話番号", "メールアドレス", "予約番号",
        ])
        no = 0
        for res in reservations:
            fees_total = sum(fee["subtotal"] for fee in res.get("fees", []))
            fee_by_type = {}
            for fee in res.get("fees", []):
                fee_by_type.setdefault(fee["type"], 0)
                fee_by_type[fee["type"]] += fee["subtotal"]

            baggage = fee_by_type.get("手荷物料金等", 0)
            seat_fee = fee_by_type.get("座席指定料金", 0)
            other_fees = fees_total - baggage - seat_fee

            first_res = True
            for pax in res.get("passengers", []):
                first_pax = True
                for fare in pax.get("fares", []):
                    no += 1
                    fi = next(
                        (fl for fl in res["flights"]
                         if fl["flight"] == fare["flight"]),
                        None,
                    )
                    w.writerow([
                        no,
                        res["pnr"] if first_res else "",
                        fi["date"] if fi else "",
                        fare["flight"],
                        fi.get("aircraft", "") if fi else "",
                        fi["dep"] if fi else "",
                        fi["dep_time"] if fi else "",
                        fi["arr"] if fi else "",
                        fi["arr_time"] if fi else "",
                        fare["fare_type"],
                        fare["amount"],
                        fare["seat"],
                        fare["seat_fee"],
                        pax["type"] if first_pax else "",
                        pax["name"] if first_pax else "",
                        pax["age"] if first_pax else "",
                        pax["gender"] if first_pax else "",
                        baggage if first_res else "",
                        seat_fee if first_res else "",
                        other_fees if first_res and other_fees else "",
                        fees_total if first_res else "",
                        res["total"] if first_res else "",
                        res.get("payment_status", "") if first_res else "",
                        "/".join(res.get("payment_methods", [])) if first_res else "",
                        res.get("phone_number", "") if first_res else "",
                        res.get("email", "") if first_res else "",
                        fi["res_no"] if fi else "",
                    ])
                    first_res = False
                    first_pax = False

    print(f"\nCSV exported: {path}")


def _esc(value) -> str:
    """HTML-escape a value for safe interpolation into HTML output."""
    return html_mod.escape(str(value)) if value else ""


def export_html(reservations: list[dict], year: str, path: str):
    """Export to a self-contained HTML file for viewing/printing."""
    # Flatten rows
    rows = []
    grand_total = 0
    for res in reservations:
        fees_total = sum(fee["subtotal"] for fee in res.get("fees", []))
        fee_by_type = {}
        for fee in res.get("fees", []):
            fee_by_type.setdefault(fee["type"], 0)
            fee_by_type[fee["type"]] += fee["subtotal"]

        first_res = True
        for pax in res.get("passengers", []):
            for fare in pax.get("fares", []):
                fi = next(
                    (fl for fl in res["flights"]
                     if fl["flight"] == fare["flight"]),
                    None,
                )
                rows.append({
                    "pnr": res["pnr"] if first_res else "",
                    "date": fi["date"] if fi else "",
                    "flight": fare["flight"],
                    "aircraft": fi.get("aircraft", "") if fi else "",
                    "dep": fi["dep"] if fi else "",
                    "dep_time": fi["dep_time"] if fi else "",
                    "arr": fi["arr"] if fi else "",
                    "arr_time": fi["arr_time"] if fi else "",
                    "fare_type": fare["fare_type"],
                    "fare_amount": fare["amount"],
                    "seat": fare["seat"],
                    "seat_fee": fare["seat_fee"],
                    "pax_type": pax["type"],
                    "pax_name": pax["name"],
                    "pax_age": pax["age"],
                    "pax_gender": pax["gender"],
                    "baggage": fee_by_type.get("手荷物料金等", 0) if first_res else None,
                    "seat_fee_total": fee_by_type.get("座席指定料金", 0) if first_res else None,
                    "other_fees": (fees_total - fee_by_type.get("手荷物料金等", 0) - fee_by_type.get("座席指定料金", 0)) if first_res else None,
                    "fees_total": fees_total if first_res else None,
                    "total": res["total"] if first_res else None,
                    "payment_status": res.get("payment_status", "") if first_res else "",
                    "payment_methods": "/".join(res.get("payment_methods", [])) if first_res else "",
                    "res_no": fi["res_no"] if fi else "",
                    "_rowspan": sum(len(p["fares"]) for p in res.get("passengers", [])) if first_res else 0,
                })
                if first_res:
                    grand_total += res["total"]
                first_res = False

    # Monthly summary
    monthly = {}
    for res in reservations:
        if not res.get("flights"):
            continue
        m = re.search(r"(\d+)月", res["flights"][0]["date"])
        if not m:
            continue
        month = int(m.group(1))
        monthly.setdefault(month, {"flights": 0, "amount": 0})
        fare_count = sum(len(p["fares"]) for p in res.get("passengers", []))
        monthly[month]["flights"] += fare_count
        monthly[month]["amount"] += res["total"]

    # Fee summary
    fee_types = {}
    fare_total = 0
    for res in reservations:
        for fee in res.get("fees", []):
            fee_types.setdefault(fee["type"], 0)
            fee_types[fee["type"]] += fee["subtotal"]
        for pax in res.get("passengers", []):
            for f in pax.get("fares", []):
                fare_total += f["amount"]

    name = ""
    if reservations and reservations[0].get("lastname_alphabet"):
        name = _esc(f"{reservations[0]['lastname_alphabet']} {reservations[0]['firstname_alphabet']}")

    # Build HTML
    html_parts = [f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>{year}年 スカイマーク搭乗履歴</title>
<style>
  body {{ font-family: "Hiragino Kaku Gothic Pro", "Yu Gothic", Meiryo, sans-serif; margin: 20px; color: #333; }}
  h1 {{ font-size: 20px; border-bottom: 2px solid #0066cc; padding-bottom: 8px; }}
  h2 {{ font-size: 16px; margin-top: 30px; border-left: 4px solid #0066cc; padding-left: 8px; }}
  .meta {{ color: #666; margin-bottom: 20px; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 20px; }}
  th {{ background: #0066cc; color: white; padding: 6px 8px; text-align: left; white-space: nowrap; }}
  td {{ border: 1px solid #ddd; padding: 5px 8px; }}
  tr:nth-child(even) td {{ background: #f8f8f8; }}
  .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .total-row td {{ background: #e8f0fe !important; font-weight: bold; }}
  .summary {{ display: flex; gap: 40px; flex-wrap: wrap; }}
  .summary table {{ width: auto; min-width: 300px; }}
  .pnr-border td {{ border-top: 2px solid #0066cc; }}
  @media print {{
    body {{ margin: 0; font-size: 11px; }}
    h1 {{ font-size: 16px; }}
    table {{ font-size: 11px; }}
    .no-print {{ display: none; }}
  }}
</style>
</head>
<body>
<h1>{year}年 スカイマーク搭乗履歴 （確定申告用）</h1>
<p class="meta">搭乗者: {name} &nbsp;|&nbsp; 生成日: {time.strftime("%Y-%m-%d")}</p>

<h2>搭乗便一覧</h2>
<table>
<tr>
  <th>#</th><th>PNR</th><th>搭乗日</th><th>便名</th><th>機材</th>
  <th>出発地</th><th>出発</th><th>到着地</th><th>到着</th>
  <th>運賃種別</th><th>運賃額</th><th>座席</th><th>座席指定料金</th>
  <th>諸費用</th><th>予約合計</th><th>支払状態</th><th>支払方法</th><th>予約番号</th>
</tr>
"""]

    for i, r in enumerate(rows, 1):
        cls = ' class="pnr-border"' if r["pnr"] else ""
        rs = f' rowspan="{r["_rowspan"]}"' if r["_rowspan"] > 1 else ""
        rs1 = rs if r["pnr"] else ""

        html_parts.append(f'<tr{cls}>')
        html_parts.append(f'  <td class="num">{i}</td>')
        if r["pnr"]:
            html_parts.append(f'  <td{rs1}>{_esc(r["pnr"])}</td>')
        html_parts.append(f'  <td>{_esc(r["date"])}</td>')
        html_parts.append(f'  <td>{_esc(r["flight"])}</td>')
        aircraft_short = r["aircraft"].replace("BOEING ", "B") if r["aircraft"] else ""
        html_parts.append(f'  <td>{_esc(aircraft_short)}</td>')
        html_parts.append(f'  <td>{_esc(r["dep"])}</td>')
        html_parts.append(f'  <td>{_esc(r["dep_time"])}</td>')
        html_parts.append(f'  <td>{_esc(r["arr"])}</td>')
        html_parts.append(f'  <td>{_esc(r["arr_time"])}</td>')
        html_parts.append(f'  <td>{_esc(r["fare_type"])}</td>')
        html_parts.append(f'  <td class="num">{r["fare_amount"]:,}円</td>')
        html_parts.append(f'  <td>{_esc(r["seat"])}</td>')
        html_parts.append(f'  <td>{_esc(r["seat_fee"])}</td>')
        if r["pnr"]:
            fee_val = f'{r["fees_total"]:,}円' if r["fees_total"] else "-"
            html_parts.append(f'  <td{rs1} class="num">{fee_val}</td>')
            html_parts.append(f'  <td{rs1} class="num">{r["total"]:,}円</td>')
            html_parts.append(f'  <td{rs1}>{_esc(r["payment_status"])}</td>')
            html_parts.append(f'  <td{rs1}>{_esc(r["payment_methods"])}</td>')
        html_parts.append(f'  <td>{_esc(r["res_no"])}</td>')
        html_parts.append('</tr>')

    # Total row
    html_parts.append(f"""
<tr class="total-row">
  <td colspan="10" style="text-align:right">合計 {len(rows)}フライト / {len(reservations)}予約</td>
  <td class="num">{fare_total:,}円</td>
  <td colspan="3"></td>
  <td class="num">{grand_total:,}円</td>
  <td colspan="3"></td>
</tr>
</table>
""")

    # Summary section
    html_parts.append('<div class="summary">')

    # Monthly
    html_parts.append("""
<div>
<h2>月別集計</h2>
<table>
<tr><th>月</th><th>フライト数</th><th>金額</th></tr>
""")
    total_f = 0
    total_a = 0
    for month in sorted(monthly):
        d = monthly[month]
        total_f += d["flights"]
        total_a += d["amount"]
        html_parts.append(f'<tr><td>{month}月</td><td class="num">{d["flights"]}</td><td class="num">{d["amount"]:,}円</td></tr>')
    html_parts.append(f'<tr class="total-row"><td>合計</td><td class="num">{total_f}</td><td class="num">{total_a:,}円</td></tr>')
    html_parts.append('</table></div>')

    # Fee breakdown
    html_parts.append("""
<div>
<h2>費用種別集計</h2>
<table>
<tr><th>種別</th><th>金額</th></tr>
""")
    html_parts.append(f'<tr><td>運賃合計</td><td class="num">{fare_total:,}円</td></tr>')
    for t, amount in sorted(fee_types.items(), key=lambda x: -x[1]):
        html_parts.append(f'<tr><td>{_esc(t)}</td><td class="num">{amount:,}円</td></tr>')
    html_parts.append(f'<tr class="total-row"><td>総合計</td><td class="num">{grand_total:,}円</td></tr>')
    html_parts.append('</table></div>')

    html_parts.append('</div>')  # end summary

    html_parts.append("""
<p class="no-print" style="margin-top: 30px; color: #999; font-size: 12px;">
  Generated by skymark
</p>
</body>
</html>""")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(html_parts))
    print(f"HTML exported: {path}")
