/**
 * Builds a full bracket state from raw JSON data + current results (confirmed or simulated).
 *
 * Trades:
 *   Each trade has { partyA: {owner, teams_given, points_given}, partyB: {...}, round }
 *   "round" = the round before which the trade takes effect (1 = before R1, 2 = before R2, etc.)
 *   Special values: "thirdPlace", "championship"
 *
 * Round order for trade application: 1, 2, 3, 4, thirdPlace, championship
 * We apply all trades whose round <= current bracket progress.
 *
 * Points scoring:
 *   Each win (rounds 1–4): +1 to the team's owner AT THE TIME of that match
 *   3rd place win: +0.5
 *   Championship win: +2 (win + bonus)
 *   Points transfers from trades also apply.
 */

const ROUND_KEYS = ['round1', 'round2', 'round3', 'round4'];

// Round order for trade sequencing
const ROUND_ORDER = [1, 2, 3, 4, 'thirdPlace', 'championship'];

function roundToOrder(r) {
  const i = ROUND_ORDER.indexOf(r);
  return i === -1 ? 999 : i;
}

/**
 * Compute effective team→owner mapping after applying all trades up to (but not including)
 * the given round. Also returns the net points transferred per owner.
 *
 * @param {object} data - raw JSON data
 * @param {number|string} beforeRound - apply trades with round < beforeRound (in ROUND_ORDER)
 * @returns {{ teamOwner: {teamId: ownerId}, pointsTransfers: {ownerId: number} }}
 */
export function applyTradesUpTo(data, beforeRound) {
  // Start with original ownership
  const teamOwner = {};
  data.teams.forEach(t => { teamOwner[t.id] = t.owner; });

  const pointsTransfers = {};
  data.owners.forEach(o => { pointsTransfers[o.id] = 0; });

  const trades = data.trades || [];
  const cutoff = roundToOrder(beforeRound);

  // Sort trades by round order, then apply sequentially
  const sorted = [...trades].sort((a, b) => roundToOrder(a.round) - roundToOrder(b.round));

  for (const trade of sorted) {
    if (roundToOrder(trade.round) > cutoff) continue;

    const { partyA, partyB } = trade;

    // Transfer teams: A gives to B, B gives to A
    (partyA.teams_given || []).forEach(teamId => {
      teamOwner[teamId] = partyB.owner;
    });
    (partyB.teams_given || []).forEach(teamId => {
      teamOwner[teamId] = partyA.owner;
    });

    // Transfer points: A gives points to B, B gives points to A
    const aGives = partyA.points_given || 0;
    const bGives = partyB.points_given || 0;
    pointsTransfers[partyA.owner] = (pointsTransfers[partyA.owner] || 0) - aGives + bGives;
    pointsTransfers[partyB.owner] = (pointsTransfers[partyB.owner] || 0) - bGives + aGives;
  }

  return { teamOwner, pointsTransfers };
}

export function buildBracket(data, simulatedResults, confirmedResults) {
  const teamMap = {};
  data.teams.forEach(t => { teamMap[t.id] = t; });

  const ownerMap = {};
  data.owners.forEach(o => { ownerMap[o.id] = { ...o }; });

  const rounds = [];

  // ---- Round 1 ----
  rounds.push(
    data.bracket.round1.map(m => ({
      matchId: m.matchId,
      team1Id: m.team1,
      team2Id: m.team2,
      winnerId: simulatedResults?.round1?.[m.matchId] || null,
      isSimulated: !Object.hasOwn(confirmedResults?.round1 || {}, m.matchId)
    }))
  );

  // ---- Rounds 2–4 ----
  for (let r = 1; r < 4; r++) {
    const prev = rounds[r - 1];
    const rKey = ROUND_KEYS[r];
    const roundSimulatedRes = simulatedResults?.[rKey] || {};
    const roundConfirmedRes = confirmedResults?.[rKey] || {};
    const matches = [];
    for (let i = 0; i < prev.length; i += 2) {
      const matchId = `r${r + 1}m${Math.floor(i / 2) + 1}`;
      const team1Id = prev[i]?.winnerId || null;
      const team2Id = prev[i + 1]?.winnerId || null;
      const winnerId = (team1Id || team2Id) ? (roundSimulatedRes[matchId] || null) : null;
      const isSimulated = roundConfirmedRes[matchId] == null;
      matches.push({ matchId, team1Id, team2Id, winnerId, isSimulated });
    }
    rounds.push(matches);
  }

  const [semi1, semi2] = rounds[3];

  // ---- Championship ----
  const champTeam1 = semi1?.winnerId || null;
  const champTeam2 = semi2?.winnerId || null;
  const champMatch = {
    matchId: 'championship',
    team1Id: champTeam1,
    team2Id: champTeam2,
    winnerId: (champTeam1 || champTeam2) ? (simulatedResults?.championship || null) : null,
    isSimulated: confirmedResults.championship == null
  };

  // ---- 3rd Place ----
  function getSemiLoser(semi) {
    if (!semi?.team1Id || !semi?.team2Id || !semi.winnerId) return null;
    return semi.winnerId === semi.team1Id ? semi.team2Id : semi.team1Id;
  }
  const thirdTeam1 = getSemiLoser(semi1);
  const thirdTeam2 = getSemiLoser(semi2);
  const thirdPlaceMatch = {
    matchId: 'thirdPlace',
    team1Id: thirdTeam1,
    team2Id: thirdTeam2,
    winnerId: (thirdTeam1 || thirdTeam2) ? (simulatedResults?.thirdPlace || null) : null,
    isSimulated: confirmedResults.thirdPlace == null
  };

  // --- Compute owner after trades ----
  const postTradeOwnerMap = {}; // map of round number to { team: owner } map
  for (let r = 1; r < 6; r++) {
    const { teamOwner } = applyTradesUpTo(data, r);
    postTradeOwnerMap[r] = teamOwner;
  }

  // ---- Compute owner points with trade-aware ownership ----
  // Start everyone at initialPoints
  const ownerEarnedPoints = {};
  data.owners.forEach(o => { 
    ownerEarnedPoints[o.id] = o.initialPoints;
  });

  // Apply points transfers from ALL trades (all rounds)
  const { pointsTransfers: allTransfers } = applyTradesUpTo(data, 999);
  data.owners.forEach(o => {
    ownerEarnedPoints[o.id] += (allTransfers[o.id] || 0);
  });
  const ownerPoints = {...ownerEarnedPoints};

  // Award win points using trade-aware ownership per round
  // Round r+1 uses ownership state "before round r+1"
  rounds.forEach((roundMatches, rIdx) => {
    const roundNum = rIdx + 1; // 1-indexed
    const { teamOwner } = applyTradesUpTo(data, roundNum);
    roundMatches.forEach(m => {
      if (!m.winnerId) return;
      const effectiveOwner = teamOwner[m.winnerId];
      if (effectiveOwner) {
        ownerPoints[effectiveOwner] = (ownerPoints[effectiveOwner] || 0) + 1;
        if (!m.isSimulated) {
          ownerEarnedPoints[effectiveOwner] = (ownerEarnedPoints[effectiveOwner] || 0) + 1;
        }
      }
    });
  });

  // 3rd place — uses ownership state before 'thirdPlace'
  if (thirdPlaceMatch.winnerId) {
    const { teamOwner } = applyTradesUpTo(data, 'thirdPlace');
    const effectiveOwner = teamOwner[thirdPlaceMatch.winnerId];
    if (effectiveOwner) {
      ownerPoints[effectiveOwner] = (ownerPoints[effectiveOwner] || 0) + 0.5;
      if (!thirdPlaceMatch.isSimulated) {
          ownerEarnedPoints[effectiveOwner] = (ownerEarnedPoints[effectiveOwner] || 0) + 0.5;
      }
    }
  }

  // Championship — uses ownership state before 'championship'
  if (champMatch.winnerId) {
    const { teamOwner } = applyTradesUpTo(data, 'championship');
    const effectiveOwner = teamOwner[champMatch.winnerId];
    if (effectiveOwner) {
      ownerPoints[effectiveOwner] = (ownerPoints[effectiveOwner] || 0) + 2;
      if (!champMatch.isSimulated) {
        ownerEarnedPoints[effectiveOwner] = (ownerEarnedPoints[effectiveOwner] || 0) + 2;
      }
    }
  }

  // ---- Current team rosters (after all trades) ----
  const { teamOwner: currentOwnership } = applyTradesUpTo(data, 999);
  const ownerTeams = {};
  data.owners.forEach(o => { ownerTeams[o.id] = []; });
  data.teams.forEach(t => {
    const currentOwner = currentOwnership[t.id] || t.owner;
    if (ownerTeams[currentOwner]) ownerTeams[currentOwner].push({ ...t });
  });

  // ---- Count wins per team (for display) ----
  const teamSimulatedPts = {};
  const teamSimElimed = {};
  const teamElimed = {};
  const teamIsChamp = {};
  const teamIsThird = {};

  const allMatchesFlat = [...rounds.flat(), thirdPlaceMatch, champMatch];
  data.teams.forEach(t => {
    teamElimed[t.id] = true;
  });
  allMatchesFlat.forEach(m => {
    teamElimed[m.team1Id] = false;
    teamElimed[m.team2Id] = false;
    teamSimElimed[m.team1Id] = false;
    teamSimElimed[m.team2Id] = false;
    if (!m?.winnerId) return;
    const losingTeamId = m.team1Id == m.winnerId? m.team2Id : m.team1Id;
    if (!m.isSimulated) {
      teamElimed[m.winnerId] = false;
      teamElimed[losingTeamId] = true;
    }
    teamSimElimed[m.winnerId] = false;
    teamSimElimed[losingTeamId] = true;
    if (m.matchId === 'championship') {
      if (m.isSimulated) teamSimulatedPts[m.winnerId] = (teamSimulatedPts[m.winnerId] || 0) + 2;
      teamIsChamp[m.winnerId] = true;
    } else if (m.matchId === 'thirdPlace') {
      if (m.isSimulated) teamSimulatedPts[m.winnerId] = (teamSimulatedPts[m.winnerId] || 0) + 0.5;
      teamIsThird[m.winnerId] = true;
    } else {
      if (m.isSimulated) teamSimulatedPts[m.winnerId] = (teamSimulatedPts[m.winnerId] || 0) + 1;
    }
  });
  console.log("Team Elimed")
  console.log(teamElimed);
  console.log("Team Sim Elimed")
  console.log(teamSimElimed);

  return {
    teamMap,
    ownerMap,
    postTradeOwnerMap,
    ownerPoints,
    ownerEarnedPoints,
    ownerTeams,       // current rosters post-trades
    teamSimulatedPts,         // teamId → points earned in simulation
    teamElimed,
    teamSimElimed,
    teamIsChamp,
    teamIsThird,
    rounds,
    thirdPlaceMatch,
    champMatch,
  };
}

export function getRoundLabel(roundIndex) {
  const labels = ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals'];
  return labels[roundIndex] || `Round ${roundIndex + 1}`;
}

export function getRoundLabelByKey(key) {
  const map = {
    1: 'Round of 32', 2: 'Round of 16', 3: 'Quarterfinals',
    4: 'Semifinals', thirdPlace: '3rd Place', championship: 'Championship',
  };
  return map[key] || `Round ${key}`;
}

export function applyPick(simulatedResults,  matchId, winnerId, data, bracketState) {
  const next = JSON.parse(JSON.stringify(simulatedResults));

  if (matchId === 'thirdPlace') { next.thirdPlace = winnerId || null; return next; }
  if (matchId === 'championship') { next.championship = winnerId || null; return next; }

  let roundIndex = -1;
  for (let r = 0; r < bracketState.rounds.length; r++) {
    if (bracketState.rounds[r].some(m => m.matchId === matchId)) { roundIndex = r; break; }
  }
  if (roundIndex === -1) return next;

  const rKey = ROUND_KEYS[roundIndex];
  if (!next[rKey]) next[rKey] = {};

  const oldWinner = next[rKey][matchId] || null;
  if (winnerId) { next[rKey][matchId] = winnerId; } else { delete next[rKey][matchId]; }

  if (oldWinner && oldWinner !== winnerId) {
    clearDownstream(next, matchId, oldWinner, roundIndex, bracketState);
  }

  return next;
}

function clearDownstream(results, matchId, lostTeamId, roundIndex, bracketState) {
  const nextRoundIndex = roundIndex + 1;

  if (nextRoundIndex < bracketState.rounds.length) {
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

  if (nextRoundIndex >= 3) {
    if (results.championship === lostTeamId) results.championship = null;
    if (results.thirdPlace === lostTeamId) results.thirdPlace = null;
  }
}

/**
 * Returns the set of team IDs that were ever owned by `ownerId` at any point
 * (original ownership OR via trades). Used for bracket highlighting.
 */
export function getEverOwnedTeams(data, ownerId) {
  const owned = new Set();

  // Original ownership
  data.teams.forEach(t => {
    if (t.owner === ownerId) owned.add(t.id);
  });

  // Teams received via trades
  (data.trades || []).forEach(trade => {
    // partyA gives teams_given → those go to partyB
    // partyB gives teams_given → those go to partyA
    if (trade.partyB.owner === ownerId) {
      (trade.partyA.teams_given || []).forEach(tid => owned.add(tid));
    }
    if (trade.partyA.owner === ownerId) {
      (trade.partyB.teams_given || []).forEach(tid => owned.add(tid));
    }
  });

  return owned;
}

/**
 * For a given team appearing in a specific round, returns who owned it at that point.
 * roundKey: 'round1'|'round2'|'round3'|'round4'|'thirdPlace'|'championship'
 */
export function getTeamOwnerAtRound(data, teamId, roundKey) {
  const roundNum = { round1: 1, round2: 2, round3: 3, round4: 4, thirdPlace: 'thirdPlace', championship: 'championship' }[roundKey];
  const { teamOwner } = applyTradesUpTo(data, roundNum);
  return teamOwner[teamId] || null;
}
