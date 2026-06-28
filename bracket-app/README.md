# Tournament Bracket Visualizer

A 32-team single-elimination bracket webapp built with Vite + React. Supports owner tracking, points simulation, and interactive pick simulation.

## Setup

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## bracket.json Format

The data file lives at `public/bracket.json`. Here's the full structure:

```json
{
  "tournament": {
    "name": "2025 Championship",
    "season": "2024–25"
  },

  "owners": [
    { "id": "alice", "name": "Alice", "initialPoints": 142.5 }
  ],

  "teams": [
    { "id": "t01", "name": "Chiefs", "seed": 1, "owner": "alice" }
  ],

  "bracket": {
    "round1": [
      { "matchId": "r1m01", "team1": "t01", "team2": "t02" }
      // ... 16 total matchups
    ]
  },

  "results": {
    "round1":     { "r1m01": "t01" },  // matchId → winning team id
    "round2":     {},
    "round3":     {},
    "round4":     {},
    "thirdPlace": null,                // winning team id or null
    "championship": null               // winning team id or null
  }
}
```

### Key rules

- **Exactly 32 teams** and **16 matchups** in `bracket.round1`.
- Round 2–4 matchups are auto-derived from the previous round's winners.
- Add actual results to the `results` object as games are played. Only results in this file are treated as "confirmed" (shown with a ✓).
- Leave future rounds as empty `{}` or `null` — you can simulate them by clicking in the UI.

## Scoring

| Event | Points |
|-------|--------|
| Any win (rounds 1–4) | +1 |
| 3rd place game win | +0.5 |
| Championship win | +2 (1 win + 1 bonus) |
| Starting points | from `initialPoints` |

## Interaction

- **Click any team** in a match whose result isn't yet confirmed to simulate that team advancing.
- **Click again** to deselect (clears that pick and all downstream picks that depended on it).
- **Reset simulation** button (appears in header when simulated picks exist) resets to confirmed results only.
- Switch to the **Standings** tab to see owner points with a visual breakdown.
