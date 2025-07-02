import json
import os
import sys
import logging
import yaml

from extract_names_and_tags import get_name_to_tag_map

if len(sys.argv) != 2:
    print("Usage: python winrate.py <player_name>")
    sys.exit(1)

player_name = sys.argv[1].lower()
person_dir = '/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_personer'
name_to_tag = get_name_to_tag_map(person_dir)
player_tag = name_to_tag.get(player_name, '').replace('#', '')

logging.basicConfig(
    filename='/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s:%(message)s'
)
print = lambda *args, **kwargs: logging.info(' '.join(map(str, args)))

log_path = f'/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/docs/fetchresult/battlelog_{player_name}.json'
state_path = f'/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/docs/fetchresult/last_battletime_{player_name}.txt'
totals_path = f'/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/docs/fetchresult/winloss_{player_name}.json'
yml_path = '/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_data/winloss.yml'

# Load last processed battleTime
last_battletime = None
if os.path.exists(state_path):
    with open(state_path) as f:
        last_battletime = f.read().strip()

# Load running totals
totals = {"victories": 0, "losses": 0, "star_players": 0}
if os.path.exists(totals_path):
    with open(totals_path) as f:
        totals = json.load(f)
else:
    totals = {}

with open(log_path, encoding='utf-8') as f:
    data = json.load(f)

totals.setdefault("victories", 0)
totals.setdefault("losses", 0)
totals.setdefault("star_players", 0)
latest_battletime = last_battletime

victories = 0
losses = 0
star_players = 0

for item in sorted(data["items"], key=lambda x: x.get("battleTime", "")):
    bt = item.get("battleTime")
    if not bt or (last_battletime and bt <= last_battletime):
        continue
    result = item.get("battle", {}).get("result")
    if result == "victory":
        victories += 1
    elif result == "defeat":
        losses += 1
    # Star player check
    star = item.get("battle", {}).get("starPlayer")
    if star and player_tag and star.get("tag", "").replace("#", "") == player_tag:
        star_players += 1
    if not latest_battletime or bt > latest_battletime:
        latest_battletime = bt

# Update running totals
totals["victories"] += victories
totals["losses"] += losses
totals["star_players"] += star_players

# Save the latest battleTime for next run
if latest_battletime:
    with open(state_path, "w") as f:
        f.write(latest_battletime)

# Save running totals (optional, for backup)
with open(totals_path, "w") as f:
    json.dump(totals, f)

# --- YAML PART ---
# Load existing YAML data
if os.path.exists(yml_path):
    with open(yml_path, "r") as f:
        winloss_data = yaml.safe_load(f) or {}
else:
    winloss_data = {}

# Update this player's stats
winloss_data[player_name] = {
    "victories": totals["victories"],
    "losses": totals["losses"],
    "star_players": totals["star_players"]
}

# Write back to YAML
with open(yml_path, "w") as f:
    yaml.dump(winloss_data, f, allow_unicode=True)

# Write a backup copy to another file
backup_path = '/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/winloss_backup.yml'
with open(backup_path, "w") as f:
    yaml.dump(winloss_data, f, allow_unicode=True)

print(f"Updated win/loss/star totals for {player_name}: {totals['victories']} victories, {totals['losses']} losses, {totals['star_players']} star players")