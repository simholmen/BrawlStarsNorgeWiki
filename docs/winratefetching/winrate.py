import json
import os
import sys

if len(sys.argv) != 2:
    print("Usage: python winrate.py <player_name>")
    sys.exit(1)

player_name = sys.argv[1].lower()
log_path = f'docs/fetchresult/battlelog_{player_name}.json'
state_path = f'docs/fetchresult/last_battletime_{player_name}.txt'
totals_path = f'docs/fetchresult/winloss_{player_name}.json'
output_path = f'docs/winloss_{player_name}.md'

# Load last processed battleTime
last_battletime = None
if os.path.exists(state_path):
    with open(state_path) as f:
        last_battletime = f.read().strip()

# Load running totals
totals = {"victories": 0, "losses": 0}
if os.path.exists(totals_path):
    with open(totals_path) as f:
        totals = json.load(f)

with open(log_path, encoding='utf-8') as f:
    data = json.load(f)

victories = 0
losses = 0
latest_battletime = last_battletime

for item in sorted(data["items"], key=lambda x: x.get("battleTime", "")):
    bt = item.get("battleTime")
    if not bt or (last_battletime and bt <= last_battletime):
        continue
    result = item.get("battle", {}).get("result")
    if result == "victory":
        victories += 1
    elif result == "defeat":
        losses += 1
    if not latest_battletime or bt > latest_battletime:
        latest_battletime = bt

# Update running totals
totals["victories"] += victories
totals["losses"] += losses

# Save the latest battleTime for next run
if latest_battletime:
    with open(state_path, "w") as f:
        f.write(latest_battletime)

# Save running totals
with open(totals_path, "w") as f:
    json.dump(totals, f)

# Write stats to markdown file
with open(output_path, "w") as f:
    f.write(f"**Totale seire:** {totals['victories']}\n\n")
    f.write(f"**Totale tap:** {totals['losses']}\n")

print(f"Updated win/loss totals for {player_name}: {totals['victories']} victories, {totals['losses']} losses")