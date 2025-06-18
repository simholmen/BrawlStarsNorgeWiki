import requests
import json

import os
API_KEY = os.environ["NO_CLUB_LB_KEY"]

headers = {"Authorization": f"Bearer {API_KEY}"}
response = requests.get(
    'https://api.brawlstars.com/v1/rankings/no/clubs?limit=200',
    headers=headers
)
data = response.json()

with open('docs/response_1750267741540.json', 'w', encoding='utf-8') as f:
    json.dump(data, f)

with open('docs/_klubber/club_table.md', 'w', encoding='utf-8') as out:
    out.write("| Rank | Club Name | Trophies | Members | Tag |\n")
    out.write("|------|-----------|----------|---------|-----|\n")
    if "items" in data:
        for club in data['items']:
            if club['name'].lower().endswith('zephyr'):
                out.write(f"| {club['rank']} | {club['name']} | {club['trophies']} | {club['memberCount']} | {club['tag']} |\n")
    else:
        print("API error:", data)