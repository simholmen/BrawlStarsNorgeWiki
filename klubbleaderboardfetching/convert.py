import json
import sys
import yaml
import os

def write_yaml(data, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as out:
        yaml.dump(data, out, allow_unicode=True)

def filter_clubs(data, keyword):
    if "items" not in data:
        return []
    result = []
    for club in data["items"]:
        if keyword in club["name"].lower():
            result.append(club)
    return result

if __name__ == "__main__":
    # Usage: python convert.py keyword1 [keyword2 ...]
    if len(sys.argv) < 2:
        print("Usage: python convert.py <keyword1> [<keyword2> ...]")
        sys.exit(1)
    keywords = [k.lower() for k in sys.argv[1:]]
    out_path = '/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_data/clubs.yml'

    with open('/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/klubbleaderboardfetching/resultat/klubbleaderboard.json') as f:
        data = json.load(f)

    all_results = {}
    for keyword in keywords:
        all_results[keyword] = filter_clubs(data, keyword)

    write_yaml(all_results, out_path)