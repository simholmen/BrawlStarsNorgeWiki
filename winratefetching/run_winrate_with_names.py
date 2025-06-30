import subprocess
from extract_names_and_tags import get_player_names

person_dir = '/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/docs/_personer'
names = get_player_names(person_dir)

success = True
for name in names:
    result = subprocess.run(
        ["python3", "/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/winratefetching/winrate.py", name],
        capture_output=True, text=True
    )
    with open("/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log", "a") as log:
        log.write(result.stdout)
        log.write(result.stderr)
    if result.returncode != 0:
        with open("/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log", "a") as log:
            log.write(f"Winrate update failed for {name}\n")
        success = False

with open("/Users/simenholmen/GitHub/BrawlStarsNorgeWiki/automation.log", "a") as log:
    if success:
        log.write("All winrates succesfully updated\n")
    else:
        log.write("Some winrate updates failed\n")