#!/bin/bash
source /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/venv/bin/activate
export $(grep -v '^#' ~/env | xargs)

echo "Update_all to retireve winrate run at $(date)" >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log

python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/battlelogfetch.py >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1

for name in lobb bindel joss ories star_virus waterflame zimma trym; do
    python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/winrate.py $name >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1
done

echo "All winrates succesfully updated at $(date)" >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log

cd /Users/simenholmen/GitHub/BrawlStarsNorgeWiki
{
    echo "Git add at $(date)"
    git add /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_data/winloss.yml
    echo "Git commit at $(date)"
    git commit --author="Auto Commit Bot <noreply@example.com>" -m "Update winloss yml file [auto]"
    echo "Git push at $(date)"
    git push
} >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1