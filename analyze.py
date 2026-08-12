import csv

FILE_PATH = "seoul-apt-latest.csv"
TARGET_GU = "강북구"


def main():
    rows = []

    with open(FILE_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["gu"] != TARGET_GU:
                continue

            price_raw = row["price"].replace(",", "").strip()
            if not price_raw:
                continue

            price_manwon = int(price_raw)
            rows.append(
                {
                    "건물명": row["complex"],
                    "물건금액(만원)": price_manwon,
                    "계약일": row["contract_date"],
                }
            )

    if not rows:
        print(f"{TARGET_GU} 데이터가 없습니다.")
        return

    rows.sort(key=lambda r: r["물건금액(만원)"], reverse=True)
    top5 = rows[:5]

    print(f"{TARGET_GU} 물건금액 상위 5건")
    for r in top5:
        print(f"{r['건물명']} | {r['물건금액(만원)']}만원 | {r['계약일']}")


if __name__ == "__main__":
    main()
