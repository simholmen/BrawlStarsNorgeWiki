import requests
import json
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path='/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/.env')

API_KEY = os.environ.get("BRAWLSTARS_API_KEY")

PLAYER_MAP = {
    "RRCLPJVP": "lobb",
    "9R2UG9JG": "bindel",
    "R8RPOYOU": "joss",
    "8QOYGP8P": "ories",
    "8Y2R282J": "star_virus",
    "RYGQV998": "waterflame",
    "2GY22JUR": "zimma",
    "99UOC22Q2": "trym_ivar",
    "YQ29980": "aambakk",
    "RU8UUYJ": "cursed",
    "UYYGP9UU": "ez",
    "9GQPJCRL": "maty",
    "2C9UP928V": "nussi",
    "YCL8J8UP": "rey",
    "22UYPCCJG": "wafles"
}
OUT_DIR = "/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/docs/fetchresult"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Accept": "application/json"
}

for tag, name in PLAYER_MAP.items():
    player_tag = tag.replace('#', '')
    url = f"https://api.brawlstars.com/v1/players/%23{player_tag}/battlelog"
    out_path = f"{OUT_DIR}/battlelog_{name}.json"
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(response.json(), f, ensure_ascii=False, indent=2)
        print(f"Battle log updated for {name}!")
    else:
        print(f"API error for {name} ({tag}):", response.status_code, response.text)