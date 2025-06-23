#!/bin/bash
# filepath: /Users/simenholmen/Documents/GitHub/BrawlStarsNorgeWiki/update_all.sh

# Fetch all battlelogs
python3 docs/winratefetching/battlelogfetch.py

# Calculate winrates for all players
for name in lobb bindel joss ories star_virus waterflame zimma; do
    python3 docs/winratefetching/winrate.py $name
done