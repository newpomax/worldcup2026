/**
 * Builds a full bracket state from raw JSON data + current results (confirmed or simulated).
 *
 * Round structure (32 teams, single elimination):
 *   Round 1 (index 0): 16 matches → 16 winners
 *   Round 2 (index 1): 8 matches  → 8 winners  (R16)
 *   Round 3 (index 2): 4 matches  → 4 winners  (QF)
 *   Round 4 (index 3): 2 matches  → 2 winners  (SF) → losers → 3rd place
 *                                                   → winners → Championship
 *
 * Points:
 *   Each win (any round): +1
 *   3rd place win: +0.5
 *   Championship win: +1 (the win) + 1 (bonus) = winner gets +2 for that match
 *   (we award +1 in the general loop, then +1 bonus separately)
 */

const ROUND_KEYS = ['round1', 'round2', 'round3', 'round4'];

export function buildBracket(data, results) {
  const teamMap = {};
  data.teams.forEach(t => { teamMap[t.id] = t; });

  const ownerMap = {};
  data.owners.forEach(o => { ownerMap[o.id] = { ...o }; });

  const rounds = []; // rounds[0..3], each is array of matches

  // ---- Round 1 ----
  rounds.push(
    data.bracket.round1.map(m => ({
      matchId: m.matchId,
      team1Id: m.team1,
      team2Id: m.team2,
      winnerId: results?.round1?.[m.matchId] || null,
    }))
  );

  // ---- Rounds 2-4: derived from prev round winners ----
  for (let r = 1; r < 4; r++) {
    const prev = rounds[r - 1];
    const rKey = ROUND_KEYS[r];
    const roundRes = results?.[rKey] || {};
    const matches = [];
    for (let i = 0; i < prev.length; i += 2) {
      const matchId = `r${r + 1}m${Math.floor(i / 2) + 1}`;
      const team1Id = prev[i]?.winnerId || null;
      const team2Id = prev[i + 1]?.winnerId || null;
      const winnerId = (team1Id || team2Id) ? (roundRes[matchId] || null) : null;
      matches.push({ matchId, team1Id, team2Id, winnerId });
    }
    rounds.push(matches);
  }

  // rounds[3] = semifinals (2 matches)
  const [semi1, semi2] = rounds[3];

  // ---- Championship: winners of both semis ----
  const champTeam1 = semi1?.winnerId || null;
  const champTeam2 = semi2?.winnerId || null;
  const champWinnerId = (champTeam1 || champTeam2) ? (results?.championship || null) : null;
  const champMatch = {
    matchId: 'championship',
    team1Id: champTeam1,
    team2Id: champTeam2,
    winnerId: champWinnerId,
  };

  // ---- 3rd Place: losers of both semis ----
  function getSemiLoser(semi) {
    if (!semi?.team1Id || !semi?.team2Id) return null;
    if (!semi.winnerId) return null;
    return semi.winnerId === semi.team1Id ? semi.team2Id : semi.team1Id;
  }
  const thirdTeam1 = getSemiLoser(semi1);
  const thirdTeam2 = getSemiLoser(semi2);
  const thirdWinnerId = (thirdTeam1 || thirdTeam2) ? (results?.thirdPlace || null) : null;
  const thirdPlaceMatch = {
    matchId: 'thirdPlace',
    team1Id: thirdTeam1,
    team2Id: thirdTeam2,
    winnerId: thirdWinnerId,
  };

  // ---- Compute owner points ----
  const ownerPoints = {};
  data.owners.forEach(o => { ownerPoints[o.id] = o.initialPoints; });

  function awardPoints(teamId, pts) {
    if (!teamId) return;
    const team = teamMap[teamId];
    if (!team) return;
    ownerPoints[team.owner] = (ownerPoints[team.owner] || 0) + pts;
  }

  // Regular round wins (rounds 1–4) — +1 each
  rounds.forEach(roundMatches => {
    roundMatches.forEach(m => {
      if (m.winnerId) awardPoints(m.winnerId, 1);
    });
  });

  // 3rd place: +0.5
  if (thirdPlaceMatch.winnerId) awardPoints(thirdPlaceMatch.winnerId, 0.5);

  // Championship: +1 (win) + 1 (bonus) = +2 total for that match
  if (champMatch.winnerId) awardPoints(champMatch.winnerId, 2);

  return {
    teamMap,
    ownerMap,
    ownerPoints,
    rounds,         // 4 rounds of the elimination bracket
    thirdPlaceMatch,
    champMatch,
  };
}

export function getRoundLabel(roundIndex) {
  const labels = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals'];
  return labels[roundIndex] || `Round ${roundIndex + 1}`;
}

/**
 * Apply a simulated pick, clearing any downstream picks now invalidated.
 */
export function applyPick(results, matchId, winnerId, data, bracketState) {
  const next = JSON.parse(JSON.stringify(results));

  if (matchId === 'thirdPlace') {
    next.thirdPlace = winnerId || null;
    return next;
  }
  if (matchId === 'championship') {
    next.championship = winnerId || null;
    return next;
  }

  // Find which round this match belongs to
  let roundIndex = -1;
  for (let r = 0; r < bracketState.rounds.length; r++) {
    if (bracketState.rounds[r].some(m => m.matchId === matchId)) {
      roundIndex = r;
      break;
    }
  }
  if (roundIndex === -1) return next;

  const rKey = ROUND_KEYS[roundIndex];
  if (!next[rKey]) next[rKey] = {};

  const oldWinner = next[rKey][matchId] || null;
  if (winnerId) {
    next[rKey][matchId] = winnerId;
  } else {
    delete next[rKey][matchId];
  }

  // Invalidate downstream if winner changed
  if (oldWinner && oldWinner !== winnerId) {
    clearDownstream(next, matchId, oldWinner, roundIndex, bracketState);
  }

  return next;
}

function clearDownstream(results, matchId, lostTeamId, roundIndex, bracketState) {
  const nextRoundIndex = roundIndex + 1;

  if (nextRoundIndex < bracketState.rounds.length) {
    // Find match position in current round
    const posInRound = bracketState.rounds[roundIndex].findIndex(m => m.matchId === matchId);
    const nextMatchIdx = Math.floor(posInRound / 2);
    const nextMatch = bracketState.rounds[nextRoundIndex]?.[nextMatchIdx];

    if (nextMatch) {
      const nextRKey = ROUND_KEYS[nextRoundIndex];
      const nextWinner = results[nextRKey]?.[nextMatch.matchId];
      if (nextWinner === lostTeamId) {
        if (!results[nextRKey]) results[nextRKey] = {};
        delete results[nextRKey][nextMatch.matchId];
        clearDownstream(results, nextMatch.matchId, lostTeamId, nextRoundIndex, bracketState);
      }
    }
  }

  // Semifinals (index 3) losers go to 3rd place
  if (nextRoundIndex === 3) {
    // The old winner might have been the semi loser heading to 3rd — but that
    // case is: if lostTeamId was about to be a semi-loser picked for 3rd
    // We handle this by clearing 3rd place if lostTeamId is currently the 3rd place winner
    if (results.thirdPlace === lostTeamId) results.thirdPlace = null;
  }

  // Semi winners go to champ
  if (nextRoundIndex >= 3) {
    if (results.championship === lostTeamId) results.championship = null;
    if (results.thirdPlace === lostTeamId) results.thirdPlace = null;
  }
}
