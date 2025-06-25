#!/bin/bash
export $(grep -v '^#' ~/env | xargs)

echo "Update club lb run at $(date)" >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log

python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/battlelogfetch.py >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1

echo "Club leaderboard succesfully updated at $(date)" >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log
