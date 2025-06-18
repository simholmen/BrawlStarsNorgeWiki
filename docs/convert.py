import json

with open('docs/response_1750267741540.json') as f:
    data = json.load(f)

with open('docs/_klubber/club_table.md', 'w', encoding='utf-8') as out:
    out.write("| Rank | Club Name | Trophies | Members | Tag |\n")
    out.write("|------|-----------|----------|---------|-----|\n")
    for club in data['items']:
        if club['name'].lower().endswith('gang'):
            out.write(f"| {club['rank']} | {club['name']} | {club['trophies']} | {club['memberCount']} | {club['tag']} |\n")