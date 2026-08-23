import re
from collections import defaultdict

import yaml


FILE_PATH = "docs/_data/tournament_stats.yml"


def to_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


with open(FILE_PATH, "r", encoding="utf-8") as f:
    data = yaml.safe_load(f)

players = data.get("players", {})
match_log = data.get("match_log", [])
individuals = {}

# ── Build individual players from team data ───────────────────────────────────
for team_stats in players.values():
    display_name = str(team_stats.get("display_name", ""))
    names = [part.strip() for part in display_name.split(",") if part.strip()] or ["Unknown"]

    for name in names:
        key = re.sub(r"\s+", " ", name.strip())
        if key not in individuals:
            individuals[key] = {
                "player_id": to_slug(key),
                "display_name": key,
                "tournaments_played": 0,
                "matches_played": 0,
                "match_wins": 0,
                "match_losses": 0,
                "match_winrate": 0.0,
                "rounds_played": 0,
                "round_wins": 0,
                "round_losses": 0,
                "titles": 0,
                "clutch_factor": 0.0,
                "boss_slayer_wins": 0,
                "underdog_wins": 0,
            }

        individual = individuals[key]
        individual["tournaments_played"] += team_stats.get("tournaments_played", 0)
        individual["matches_played"] += team_stats.get("matches_played", 0)
        individual["match_wins"] += team_stats.get("match_wins", 0)
        individual["match_losses"] += team_stats.get("match_losses", 0)
        individual["rounds_played"] += team_stats.get("rounds_played", 0)
        individual["round_wins"] += team_stats.get("round_wins", 0)
        individual["round_losses"] += team_stats.get("round_losses", 0)
        individual["titles"] += team_stats.get("titles", 0)

# Winrate and clutch_factor
for stats in individuals.values():
    played = stats["matches_played"]
    stats["match_winrate"] = round((stats["match_wins"] / played), 4) if played else 0.0
    round_diff = stats["round_wins"] - stats["round_losses"]
    stats["clutch_factor"] = round((round_diff / played), 3) if played else 0.0

# Slug-keyed lookup for match_log processing.
# Also map the canonical team-level key (e.g. "ocean") → individual,
# so match_log member_ids (which are canonical slugs) resolve correctly.
by_slug = {ind["player_id"]: ind for ind in individuals.values()}
for team_key, team_stats in players.items():
    display_name = str(team_stats.get("display_name", ""))
    names = [part.strip() for part in display_name.split(",") if part.strip()] or ["Unknown"]
    for name in names:
        norm_key = re.sub(r"\s+", " ", name.strip())
        if norm_key in individuals and team_key not in by_slug:
            by_slug[team_key] = individuals[norm_key]

# ── H2H rivalry table ─────────────────────────────────────────────────────────
h2h_wins: dict = defaultdict(lambda: defaultdict(int))

for match in match_log:
    p1 = match.get("p1_members", [])
    p2 = match.get("p2_members", [])
    winner_side = match.get("winner")

    for a in p1:
        for b in p2:
            pair = tuple(sorted([a, b]))
            if winner_side == "p1":
                h2h_wins[pair][a] += 1
            elif winner_side == "p2":
                h2h_wins[pair][b] += 1

rivalry_table = []
for (a, b), wins_dict in h2h_wins.items():
    total = sum(wins_dict.values())
    if total < 2:
        continue
    a_wins = wins_dict.get(a, 0)
    b_wins = wins_dict.get(b, 0)
    a_name = by_slug[a]["display_name"] if a in by_slug else a
    b_name = by_slug[b]["display_name"] if b in by_slug else b
    rivalry_table.append({
        "player1_id": a,
        "player1_name": a_name,
        "player2_id": b,
        "player2_name": b_name,
        "player1_wins": a_wins,
        "player2_wins": b_wins,
        "total_matches": total,
    })

rivalry_table.sort(key=lambda r: (-r["total_matches"], r["player1_name"].lower()))

# ── Boss Slayer: wins against top-10 players by career match wins ─────────────
all_rows = list(individuals.values())
top_bosses = {
    row["player_id"]
    for row in sorted(all_rows, key=lambda x: -x["match_wins"])[:10]
}

# ── Underdog: wins where opponent avg match_wins > your match_wins ────────────
for match in match_log:
    p1 = match.get("p1_members", [])
    p2 = match.get("p2_members", [])
    winner_side = match.get("winner")
    if not winner_side or winner_side not in ("p1", "p2"):
        continue

    winners = p1 if winner_side == "p1" else p2
    opponents = p2 if winner_side == "p1" else p1

    known_opponents = [o for o in opponents if o in by_slug]
    if not known_opponents:
        continue

    opp_avg_wins = sum(by_slug[o]["match_wins"] for o in known_opponents) / len(known_opponents)
    has_boss = any(o in top_bosses for o in opponents)

    for w in winners:
        if w not in by_slug:
            continue
        ind = by_slug[w]
        if has_boss:
            ind["boss_slayer_wins"] += 1
        if opp_avg_wins > ind["match_wins"]:
            ind["underdog_wins"] += 1

# ── Sort leaderboards ─────────────────────────────────────────────────────────
rows = list(individuals.values())

by_wins = sorted(rows, key=lambda x: (-x["match_wins"], -x["matches_played"], x["display_name"].lower()))
by_winrate = sorted(
    rows,
    key=lambda x: (-x["match_winrate"], -x["matches_played"], x["display_name"].lower()),
)
by_worst_winrate = sorted(
    [r for r in rows if r["matches_played"] >= 5],
    key=lambda x: (x["match_winrate"], -x["matches_played"], x["display_name"].lower()),
)
by_rounds = sorted(rows, key=lambda x: (-x["rounds_played"], -x["matches_played"], x["display_name"].lower()))
by_matches = sorted(rows, key=lambda x: (-x["matches_played"], -x["match_wins"], x["display_name"].lower()))
by_clutch = sorted(
    [r for r in rows if r["matches_played"] >= 5],
    key=lambda x: (-x["clutch_factor"], -x["matches_played"], x["display_name"].lower()),
)
by_boss_slayer = sorted(
    [r for r in rows if r["boss_slayer_wins"] >= 1],
    key=lambda x: (-x["boss_slayer_wins"], -x["match_wins"], x["display_name"].lower()),
)
by_underdog = sorted(
    [r for r in rows if r["underdog_wins"] >= 1],
    key=lambda x: (-x["underdog_wins"], -x["match_wins"], x["display_name"].lower()),
)

# ── Write back to YAML ────────────────────────────────────────────────────────
data["individual_leaderboards"] = {
    "most_match_wins": by_wins,
    "best_match_winrate": by_winrate,
    "worst_match_winrate_min5": by_worst_winrate,
    "most_rounds_played": by_rounds,
    "most_matches_played": by_matches,
    "best_clutch_factor_min5": by_clutch,
    "rivalry_table": rivalry_table,
    "boss_slayer": by_boss_slayer,
    "underdog": by_underdog,
}

data["individual_players"] = {
    row["player_id"]: {
        "display_name": row["display_name"],
        "tournaments_played": row["tournaments_played"],
        "matches_played": row["matches_played"],
        "match_wins": row["match_wins"],
        "match_losses": row["match_losses"],
        "match_winrate": row["match_winrate"],
        "rounds_played": row["rounds_played"],
        "round_wins": row["round_wins"],
        "round_losses": row["round_losses"],
        "titles": row["titles"],
        "clutch_factor": row["clutch_factor"],
        "boss_slayer_wins": row["boss_slayer_wins"],
        "underdog_wins": row["underdog_wins"],
    }
    for row in sorted(rows, key=lambda x: x["player_id"])
}

with open(FILE_PATH, "w", encoding="utf-8") as f:
    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)

print(f"INDIVIDUALS {len(rows)}")
print(f"RIVALRY PAIRS {len(rivalry_table)} (met >= 2 times)")
print(f"BOSS SLAYER entries {len(by_boss_slayer)}")
print(f"UNDERDOG entries {len(by_underdog)}")
print("\nTOP RIVALRY")
for r in rivalry_table[:12]:
    print(f"  {r['player1_name']} {r['player1_wins']}-{r['player2_wins']} {r['player2_name']}  (total {r['total_matches']})")
print("\nTOP BOSS SLAYER")
for r in by_boss_slayer[:10]:
    print(f"  {r['display_name']} | boss wins {r['boss_slayer_wins']} | total wins {r['match_wins']}")
print("\nTOP UNDERDOG")
for r in by_underdog[:10]:
    print(f"  {r['display_name']} | underdog wins {r['underdog_wins']} | total wins {r['match_wins']}")
