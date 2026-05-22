import os
from pathlib import Path

import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent.parent / ".env"
if not env_path.exists():
    raise FileNotFoundError(f".env file not found: {env_path}")
load_dotenv(env_path)

SUPABASE_URL = os.environ["VITE_SUPABASE_URL"]
SUPABASE_KEY = os.environ["VITE_SUPABASE_ANON_KEY"]


DATA_PATH = Path(__file__).parent / "data" / "NBASeriesResults.xlsx"

def load_game_sevens(home_team: str | None = None) -> dict:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Data file not found: {DATA_PATH}")
    
    df = pd.read_excel(DATA_PATH)
    sevens = df[df["Total games"] == 7].copy()

    if sevens.empty:
        print("No 7-game series found.")
        return {"inserted": 0, "errors": []}

    client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    inserted = 0
    errors = []

    for _, row in sevens.iterrows():
        record = {
            "year":           int(row["Year"]),
            "round":          str(row["Series Type"]),
            "team_a":         str(row["Winner Team"]),
            "team_b":         str(row["Loser Team"]),
            "game_1_score_a": int(row["G1 Score W"]),
            "game_1_score_b": int(row["G1 Score L"]),
            "game_2_score_a": int(row["G2 Score W"]),
            "game_2_score_b": int(row["G2 Score L"]),
            "game_3_score_a": int(row["G3 Score W"]),
            "game_3_score_b": int(row["G3 Score L"]),
            "game_4_score_a": int(row["G4 Score W"]),
            "game_4_score_b": int(row["G4 Score L"]),
            "game_5_score_a": int(row["G5 Score W"]),
            "game_5_score_b": int(row["G5 Score L"]),
            "game_6_score_a": int(row["G6 Score W"]),
            "game_6_score_b": int(row["G6 Score L"]),
            "game_7_score_a": int(row["G7 Score W"]),
            "game_7_score_b": int(row["G7 Score L"]),
            "winner":         str(row["Winner Team"]),
            "home_team":      home_team,
        }

        try:
            client.table("game_sevens").insert(record).execute()
            inserted += 1
            print(f"  ✓ {row['Year']} {row['Series Type']} — {row['Winner Team']} vs {row['Loser Team']}")
        except Exception as e:
            msg = f"{row['Year']} {row['Series Type']} — {e}"
            errors.append(msg)
            print(f"  ✗ {msg}")

    return {"inserted": inserted, "errors": errors}


if __name__ == "__main__":
    result = load_game_sevens()
    print(f"\nDone — inserted: {result['inserted']}, errors: {len(result['errors'])}")