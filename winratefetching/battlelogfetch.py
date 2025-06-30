import requests
import json
import os
from dotenv import load_dotenv
import sys

sys.path.append(os.path.dirname(__file__))  # Ensure local import works
from extract_names_and_tags import get_player_map

load_dotenv(dotenv_path='/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/.env')

API_KEY = os.environ.get("BRAWLSTARS_API_KEY")
person_dir = '/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_personer'
PLAYER_MAP = get_player_map(person_dir)

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