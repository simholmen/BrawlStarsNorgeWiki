#!/bin/bash
source /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/venv/bin/activate
export $(grep -v '^#' ~/env | xargs)

echo "Update_all to retireve winrate run at $(date)" >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log

python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/battlelogfetch.py >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1

python3 /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/run_winrate_with_names.py >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1

cd /Users/simenholmen/GitHub/BrawlStarsNorgeWiki
{
    echo "Git add at $(date)"
    git add /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_data/winloss.yml
    echo "Git commit at $(date)"
    git commit --author="Auto Commit Bot <noreply@example.com>" -m "Update winloss yml file [auto]"
    echo "Git push at $(date)"
    git push
} >> /Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log 2>&1