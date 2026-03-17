import os
import re
import time
from datetime import datetime, timezone

import requests
import yaml


REPO_ROOT = "/Users/simenholmen/GitHub/BrawlStarsNorgeWiki"
OUTPUT_PATH = os.path.join(REPO_ROOT, "docs", "_data", "tournament_stats.yml")

TOURNAMENTS = [
    {
        "id": "mz3",
        "title": "MZ Turnering #3",
        "date": "2023-05-05",
        "challonge_id": "ovea2dyg",
    },
    {
        "id": "mz4",
        "title": "MZ Turnering #4",
        "date": "2023-09-09",
        "challonge_id": "596c8m49",
    },
    {
        "id": "mz5",
        "title": "MZ Turnering #5",
        "date": "2024-02-11",
        "challonge_id": "s8i7hn4q",
    },
    {
        "id": "mz7",
        "title": "MZ Turnering #7",
        "date": "2025-03-16",
        "challonge_id": "x86ogpg4",
    },
    {
        "id": "mz8",
        "title": "MZ Turnering #8",
        "date": "2025-07-04",
        "challonge_id": "cuvmteme",
    },
    {
        "id": "mz9",
        "title": "MZ Turnering #9",
        "date": "2026-03-15",
        "challonge_id": "ckhdn55u",
    },
]

PLAYER_ALIASES = {
    "scaresquad": "scaresquad",
    "scaresquad_": "scaresquad",
    "flash": "The Flash",
    "theflash": "The Flash",
    "the flash": "The Flash",
    "the_flash": "The Flash",
    "lord fire/henn": "Lord Fire",
    "lord fire": "Lord Fire",
    "henn": "Sleepyhenn",
    "sleepyhenn": "Sleepyhenn",
    "lobb/joss": "Lobb",
    "lobb": "Lobb",
    "joss": "Joss",
    "lybx gyat": "Lybx",
    "lybx_gyat": "Lybx",
    "lybx": "Lybx",
    "gyat": "Lybx",
    "SUS-Ram": "Sus Ram",
    "sus-ram": "Sus Ram",
    "sus ram": "Sus Ram",
    "dennizz": "Denniz",
    "Dennizz": "Denniz",
    "wiederdude/osen": "Wiederdude",
    "wiederdude_osen": "Wiederdude",
    "Wiederdude/osen": "Wiederdude",
    "Wiederdude_osen": "Wiederdude",
    "2.0cean": "Ocean",
    "2.Ocean": "Ocean",
}


def to_slug(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


def normalize_aliases(raw_aliases):
    normalized = {}
    for key, value in raw_aliases.items():
        key_slug = to_slug(str(key))
        value_slug = to_slug(str(value))
        if key_slug:
            normalized[key_slug] = value_slug or key_slug
    return normalized


PLAYER_ALIASES = normalize_aliases(PLAYER_ALIASES)


def load_api_key() -> str:
    env_key = os.environ.get("CHALLONGE_API_KEY", "").strip()
    if env_key:
        return env_key

    env_path = os.path.join(REPO_ROOT, ".env")
    if not os.path.exists(env_path):
        return ""

    with open(env_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "CHALLONGE_API_KEY":
                return value.strip().strip('"').strip("'")

    return ""


def slugify_name(name: str) -> str:
    slug = to_slug(name)
    if not slug:
        slug = "unknown"
    return PLAYER_ALIASES.get(slug, slug)


def split_team_members(display_name: str):
    members = [part.strip() for part in display_name.split(",") if part.strip()]
    if members:
        return members
    return [display_name.strip()] if display_name.strip() else ["Unknown"]


def parse_scores_for_player(scores_csv: str, player_is_p1: bool):
    if not scores_csv:
        return 0, 0, 0

    round_wins = 0
    round_losses = 0
    rounds_played = 0

    for set_score in scores_csv.split(","):
        set_score = set_score.strip()
        if not set_score or "-" not in set_score:
            continue
        left, right = set_score.split("-", 1)
        try:
            p1_score = int(left.strip())
            p2_score = int(right.strip())
        except ValueError:
            continue

        if player_is_p1:
            my_score = p1_score
            opp_score = p2_score
        else:
            my_score = p2_score
            opp_score = p1_score

        total_score = my_score + opp_score

        if total_score > 9:
            if my_score > opp_score:
                round_wins += 1
            elif my_score < opp_score:
                round_losses += 1
            rounds_played += 1
            continue

        round_wins += my_score
        round_losses += opp_score
        rounds_played += total_score

    return round_wins, round_losses, rounds_played


def get_json(url: str, api_key: str, attempts: int = 4):
    retry_statuses = {429, 502, 503, 504, 520}
    headers = {"User-Agent": "BrawlStarsNorgeWiki/1.0"}

    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, params={"api_key": api_key}, headers=headers, timeout=30)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(2 ** (attempt - 1))
                continue
            raise

        if response.status_code == 200:
            return response.json()

        if response.status_code in retry_statuses and attempt < attempts:
            time.sleep(2 ** (attempt - 1))
            continue

        response.raise_for_status()

    if last_error:
        raise last_error

    raise RuntimeError("Unknown API error while fetching Challonge data")


def ensure_player(players, player_id, display_name):
    if player_id not in players:
        players[player_id] = {
            "display_name": display_name,
            "tournaments_played": 0,
            "matches_played": 0,
            "match_wins": 0,
            "match_losses": 0,
            "match_winrate": 0.0,
            "round_wins": 0,
            "round_losses": 0,
            "rounds_played": 0,
            "titles": 0,
        }


def add_leaderboard_rankings(players_dict, min_matches_for_winrate=5):
    rows = []
    for player_id, stats in players_dict.items():
        rows.append(
            {
                "player_id": player_id,
                "display_name": stats["display_name"],
                "matches_played": stats["matches_played"],
                "match_wins": stats["match_wins"],
                "match_winrate": stats["match_winrate"],
                "rounds_played": stats["rounds_played"],
            }
        )

    most_rounds = sorted(rows, key=lambda x: (-x["rounds_played"], -x["matches_played"], x["player_id"]))
    most_wins = sorted(rows, key=lambda x: (-x["match_wins"], -x["matches_played"], x["player_id"]))

    eligible_for_winrate = [r for r in rows if r["matches_played"] >= min_matches_for_winrate]
    best_winrate = sorted(
        eligible_for_winrate,
        key=lambda x: (-x["match_winrate"], -x["matches_played"], x["player_id"]),
    )

    return {
        "most_rounds_played": [dict(item) for item in most_rounds],
        "most_match_wins": [dict(item) for item in most_wins],
        "best_match_winrate": [dict(item) for item in best_winrate],
    }


def main():
    api_key = load_api_key()
    if not api_key:
        raise RuntimeError("Missing CHALLONGE_API_KEY. Set it in env or in .env at repo root.")

    players = {}
    match_log = []
    processed_tournaments = []
    skipped_tournaments = []

    for tournament in TOURNAMENTS:
        challonge_id = tournament.get("challonge_id", "").strip()
        if not challonge_id:
            skipped_tournaments.append({
                "id": tournament["id"],
                "title": tournament["title"],
                "reason": "missing challonge_id",
            })
            continue

        tournament_url = f"https://api.challonge.com/v1/tournaments/{challonge_id}.json"
        participants_url = f"https://api.challonge.com/v1/tournaments/{challonge_id}/participants.json"
        matches_url = f"https://api.challonge.com/v1/tournaments/{challonge_id}/matches.json"

        try:
            tournament_json = get_json(tournament_url, api_key).get("tournament", {})
            participants_json = get_json(participants_url, api_key)
            matches_json = get_json(matches_url, api_key)
        except requests.RequestException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            reason = f"api_http_{status_code}" if status_code else "api_request_failed"
            skipped_tournaments.append(
                {
                    "id": tournament["id"],
                    "title": tournament["title"],
                    "reason": reason,
                }
            )
            print(f"Skipping {tournament['id']} ({tournament['title']}): {reason}")
            continue

        participants_by_id = {}
        for p in participants_json:
            participant = p.get("participant", {})
            challonge_participant_id = participant.get("id")
            team_display_name = participant.get("display_name") or participant.get("name") or "Unknown"
            if challonge_participant_id is None:
                continue
            member_names = split_team_members(team_display_name)
            member_ids = []
            for member_name in member_names:
                canonical_id = slugify_name(member_name)
                ensure_player(players, canonical_id, member_name)
                member_ids.append(canonical_id)

            participants_by_id[challonge_participant_id] = {
                "team_display_name": team_display_name,
                "member_ids": member_ids,
            }

        tournament_players = set()
        for match_wrapper in matches_json:
            match = match_wrapper.get("match", {})
            player1_id = match.get("player1_id")
            player2_id = match.get("player2_id")
            winner_id = match.get("winner_id")

            if player1_id not in participants_by_id or player2_id not in participants_by_id:
                continue

            p1_info = participants_by_id[player1_id]
            p2_info = participants_by_id[player2_id]

            p1_members = p1_info["member_ids"]
            p2_members = p2_info["member_ids"]

            for member_id in p1_members:
                players[member_id]["matches_played"] += 1
                tournament_players.add(member_id)
            for member_id in p2_members:
                players[member_id]["matches_played"] += 1
                tournament_players.add(member_id)

            if winner_id == player1_id:
                for member_id in p1_members:
                    players[member_id]["match_wins"] += 1
                for member_id in p2_members:
                    players[member_id]["match_losses"] += 1
            elif winner_id == player2_id:
                for member_id in p2_members:
                    players[member_id]["match_wins"] += 1
                for member_id in p1_members:
                    players[member_id]["match_losses"] += 1

            scores_csv = match.get("scores_csv", "")
            p1_round_wins, p1_round_losses, p1_rounds_played = parse_scores_for_player(scores_csv, player_is_p1=True)
            p2_round_wins, p2_round_losses, p2_rounds_played = parse_scores_for_player(scores_csv, player_is_p1=False)

            for member_id in p1_members:
                players[member_id]["round_wins"] += p1_round_wins
                players[member_id]["round_losses"] += p1_round_losses
                players[member_id]["rounds_played"] += p1_rounds_played

            for member_id in p2_members:
                players[member_id]["round_wins"] += p2_round_wins
                players[member_id]["round_losses"] += p2_round_losses
                players[member_id]["rounds_played"] += p2_rounds_played

            match_log.append({
                "tournament_id": tournament["id"],
                "p1_members": p1_members,
                "p2_members": p2_members,
                "winner": "p1" if winner_id == player1_id else ("p2" if winner_id == player2_id else None),
            })

        winners = tournament_json.get("final_ranking") or []
        if winners and isinstance(winners, list):
            first_place = winners[0] if winners else None
            if isinstance(first_place, dict):
                winner_participant_id = first_place.get("participant_id")
                if winner_participant_id in participants_by_id:
                    for winner_player_id in participants_by_id[winner_participant_id]["member_ids"]:
                        players[winner_player_id]["titles"] += 1

        for player_id in tournament_players:
            players[player_id]["tournaments_played"] += 1

        processed_tournaments.append(
            {
                "id": tournament["id"],
                "title": tournament["title"],
                "date": tournament["date"],
                "challonge_id": challonge_id,
                "name": tournament_json.get("name"),
                "participants_count": len(participants_by_id),
                "matches_count": len(matches_json),
            }
        )

    for stats in players.values():
        played = stats["matches_played"]
        stats["match_winrate"] = round((stats["match_wins"] / played), 4) if played else 0.0

    leaderboards = add_leaderboard_rankings(players)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "challonge_api_once",
        "notes": [
            "Set CHALLONGE_API_KEY before running this script.",
            "Participants are split into individual players using comma-separated names.",
            "match_winrate is a decimal between 0 and 1.",
            "scores_csv entries with suspiciously large totals are treated as one decided round.",
        ],
        "leaderboards": leaderboards,
        "players": dict(sorted(players.items(), key=lambda item: item[0])),
        "match_log": match_log,
        "tournaments": {
            "total_tournaments": len(processed_tournaments),
            "total_matches": sum(t["matches_count"] for t in processed_tournaments),
            "total_rounds": sum(p["rounds_played"] for p in players.values()) // 2,
            "processed": processed_tournaments,
            "skipped": skipped_tournaments,
        },
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(output, f, allow_unicode=True, sort_keys=False)

    print(f"Wrote tournament stats to {OUTPUT_PATH}")
    print(f"Processed tournaments: {len(processed_tournaments)}")
    if skipped_tournaments:
        print("Skipped:")
        for skipped in skipped_tournaments:
            print(f"- {skipped['id']} ({skipped['title']}): {skipped['reason']}")


if __name__ == "__main__":
    main()
