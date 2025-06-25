import requests
import json
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path='/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/.env')

API_KEY = os.environ.get("BRAWLSTARS_API_KEY")


OUT_DIR = "/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/klubbleaderboardfetching/resultat"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Accept": "application/json"
}

os.makedirs(OUT_DIR, exist_ok=True)

url = f"https://api.brawlstars.com/v1/rankings/no/clubs"
out_path = f"{OUT_DIR}/klubbleaderboard.json"
response = requests.get(url, headers=headers)
if response.status_code == 200:
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(response.json(), f, ensure_ascii=False, indent=2)
    print(f"Club leaderboard updated")
else:
    print(f"API error for clubleaderboard:", response.status_code, response.text)