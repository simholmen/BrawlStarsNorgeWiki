#!/bin/bash
export $(grep -v '^#' ~/env | xargs)

echo "Update run at $(date)" >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log

python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/battlelogfetch.py >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1

for name in lobb bindel joss ories star_virus waterflame zimma; do
    python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/winrate.py $name
done

cp /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/docs/fetchresult/winloss_*.md /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/diverse/slindringene

cd /Users/simenholmen/GitHub/BrawlStarsNorgeWiki
{
    echo "Git add at $(date)"
    git add /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/diverse/slindringene/winloss_*.md
    echo "Git commit at $(date)"
    git commit -m "Update winloss markdown [auto]"
    echo "Git push at $(date)"
    git push
} >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1