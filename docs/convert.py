import json
import sys

def write_table(clubs, out_path):
    with open(out_path, 'w', encoding='utf-8') as out:
        out.write("| Rank | Club Name | Trophies | Members | Tag |\n")
        out.write("|------|-----------|----------|---------|-----|\n")
        for club in clubs:
            out.write(f"| {club['rank']} | {club['name']} | {club['trophies']} | {club['memberCount']} | {club['tag']} |\n")

def filter_clubs(data, keywords):
    if "items" not in data:
        print("API error:", data)
        return []
    return [
        club for club in data["items"]
        if any(keyword in club["name"].lower() for keyword in keywords)
    ]

if __name__ == "__main__":
    # Usage: python convert.py keyword1 [keyword2 ...] output.md
    if len(sys.argv) < 3:
        print("Usage: python convert.py <keyword1> [<keyword2> ...] <output.md>")
        sys.exit(1)
    *keywords, out_path = sys.argv[1:]
    keywords = [k.lower() for k in keywords]

    with open('docs/fetchresult/klubber.json') as f:
        data = json.load(f)

    clubs = filter_clubs(data, keywords)
    write_table(clubs, out_path)


 # python3 docs/convert.py zephyr docs/_klubber/zephyr_table.md endswith
 # python3 docs/convert.py lonely docs/_klubber/lonely_table.md