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
  if ( r === 0) return -1;
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
      const matchNum = (Math.floor(i / 2) + 1).toString().padStart(2, '0');
      const matchId = `r${r + 1}m${matchNum}`;
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

  // --- Compute owner after trades ----
  const postTradeOwnerMap = {}; // map of round number to { team: owner } map
  for (let r = 0; r < 6; r++) {
    const { teamOwner } = applyTradesUpTo(data, r);
    postTradeOwnerMap[r] = teamOwner;
  }

  // ---- Compute teams ever owned by each owner (original + trades) ----
  const previouslyOwnedTeams = {};
  Object.entries(teamMap).forEach(([teamId, team]) => {
    const prevSet = previouslyOwnedTeams[team.owner] || [];
    previouslyOwnedTeams[team.owner] = [...new Set([...prevSet, teamId])];
  });
  for (const trade of data.trades || []) {
    const { partyA, partyB } = trade;
    const teamsInvolved = [...(partyA.teams_given || []), ...(partyB.teams_given || [])];
    const partAPrev = previouslyOwnedTeams[partyA.owner] || [];
    previouslyOwnedTeams[partyA.owner] = [...new Set([...partAPrev, ...teamsInvolved])];
    const partBPrev = previouslyOwnedTeams[partyB.owner] || [];
    previouslyOwnedTeams[partyB.owner] = [...new Set([...partBPrev, ...teamsInvolved])];
  }
  Object.entries(previouslyOwnedTeams).forEach(([ownerId, teamIds]) => {
    previouslyOwnedTeams[ownerId] = teamIds.map(tid => teamMap[tid]).filter(Boolean);
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
    teamSimElimed[t.id] = true;
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

  return {
    teamMap,
    ownerMap,
    postTradeOwnerMap,
    ownerPoints,
    ownerEarnedPoints,
    ownerTeams,       // current rosters post-trades
    previouslyOwnedTeams, // map of ownerId → set of teamIds they ever owned (original or via trades)
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

/**
 * Computes the maximum possible total points for each owner given the current
 * confirmed results and the remaining unplayed matches.
 *
 * Algorithm:
 *   For each bracket slot (match), we recursively find which teams from a given
 *   owner *could* reach that slot. Then we greedily assign wins to maximize the
 *   owner's points, handling the case where two of their teams meet (only one
 *   can advance).
 *
 * Returns: { [ownerId]: maxPoints }
 */
export function computeMaxScores(data, confirmedResults, bracketState) {
  const { rounds, thirdPlaceMatch, champMatch, teamMap } = bracketState;
  const ROUND_KEYS = ['round1', 'round2', 'round3', 'round4'];

  // For each owner, compute max additional points they can earn from here.
  // We do this by walking the bracket tree and for each match finding the best
  // outcome for the owner.

  // Build a map: matchId -> match object (for quick lookup)
  const matchById = {};
  rounds.forEach(r => r.forEach(m => { matchById[m.matchId] = { ...m, type: 'regular' }; }));
  matchById['thirdPlace'] = { ...thirdPlaceMatch, type: 'thirdPlace' };
  matchById['championship'] = { ...champMatch, type: 'championship' };

  // Build parent map: matchId -> { parentMatchId, slot (1 or 2) }
  // so we know which match a winner feeds into
  const feedsInto = {}; // matchId -> { matchId, teamSlot }
  rounds.forEach((roundMatches, rIdx) => {
    if (rIdx >= rounds.length - 1) return; // last regular round feeds semis
    roundMatches.forEach((m, posInRound) => {
      const nextMatchIdx = Math.floor(posInRound / 2);
      const nextMatch = rounds[rIdx + 1]?.[nextMatchIdx];
      if (nextMatch) {
        feedsInto[m.matchId] = { matchId: nextMatch.matchId, slot: posInRound % 2 === 0 ? 1 : 2 };
      }
    });
  });
  // Semis feed championship and thirdPlace
  if (rounds[3]) {
    feedsInto[rounds[3][0].matchId] = { matchId: 'championship', slot: 1 };
    feedsInto[rounds[3][1].matchId] = { matchId: 'championship', slot: 2 };
    // losers of semis feed thirdPlace — handled separately
  }

  /**
   * For a given match, returns the set of teams that could possibly reach
   * that match as a participant (team1 or team2 slot), given confirmed results.
   * If the match has a confirmed team in that slot already, returns just that team.
   */
  function possibleTeamsForSlot(matchId, slot) {
    const match = matchById[matchId];
    if (!match) return new Set();
    const teamId = slot === 1 ? match.team1Id : match.team2Id;
    if (teamId) return new Set([teamId]); // already determined

    // Slot is TBD — find the match that feeds into this slot
    // and recursively find all teams that could win it
    const feederMatchId = Object.keys(feedsInto).find(
      mid => feedsInto[mid].matchId === matchId && feedsInto[mid].slot === slot
    );
    if (!feederMatchId) return new Set();
    return possibleWinnersOf(feederMatchId);
  }

  /**
   * Returns the set of teams that could possibly win the given match.
   * For confirmed/simulated matches with a winner, returns just that winner.
   * For unplayed matches, returns all teams that could possibly reach it.
   */
  function possibleWinnersOf(matchId) {
    const match = matchById[matchId];
    if (!match) return new Set();

    // If there's already a winner (confirmed or simulated), that's the only possibility
    if (match.winnerId) return new Set([match.winnerId]);

    // Otherwise, union of all teams that could reach either slot
    const s1 = possibleTeamsForSlot(matchId, 1);
    const s2 = possibleTeamsForSlot(matchId, 2);
    return new Set([...s1, ...s2]);
  }

  /**
   * Computes the maximum points an owner can earn from a given match subtree,
   * assuming they optimally choose outcomes for unplayed matches.
   *
   * Returns: { maxPts, bestWinner } where bestWinner is the team the owner
   * would want to win this match.
   *
   * isThirdPlace / isChampionship affect point values.
   */
  function maxPtsFromMatch(matchId, ownerId, roundIdx) {
    const match = matchById[matchId];
    if (!match) return { maxPts: 0, bestWinner: null };

    const isChamp = matchId === 'championship';
    const isThird = matchId === 'thirdPlace';
    const winPts = isChamp ? 2 : isThird ? 0.5 : 1;

    // Get ownership at this round
    const roundNum = isChamp ? 'championship' : isThird ? 'thirdPlace' : roundIdx + 1;
    const { teamOwner } = applyTradesUpTo(data, roundNum);

    // If the match already has a winner (confirmed or simulated)
    if (match.winnerId) {
      const owner = teamOwner[match.winnerId];
      const pts = owner === ownerId ? winPts : 0;
      return { maxPts: pts, bestWinner: match.winnerId };
    }

    // Match is unplayed. Find possible teams for each slot.
    const teams1 = possibleTeamsForSlot(matchId, 1);
    const teams2 = possibleTeamsForSlot(matchId, 2);

    // For each possible team in slot 1 winning, and each possible team in slot 2 winning,
    // compute best outcome — but since we're maximizing for one owner, we just need to
    // find which team winning this match is best for the owner.
    // The best winner is:
    //   1. An owner's team (earns winPts for this match), OR
    //   2. Any team (earns 0) — but still matters for downstream

    // Since we're just computing max total, and downstream matches are independent
    // subtrees, we can compute: for each candidate winner, what's the max pts
    // the owner earns from THIS match + downstream assuming that winner.
    // But that gets exponential. Instead, use a greedy upper bound:
    // - For each slot, assume the owner's team (if any) wins all its prior matches
    // - If both slots could have the owner's team, pick the path with more downstream value

    const ownerTeams1 = [...teams1].filter(tid => teamOwner[tid] === ownerId);
    const ownerTeams2 = [...teams2].filter(tid => teamOwner[tid] === ownerId);

    const hasOwnerIn1 = ownerTeams1.length > 0;
    const hasOwnerIn2 = ownerTeams2.length > 0;

    if (!hasOwnerIn1 && !hasOwnerIn2) {
      // Owner has no team that can reach this match — earns 0 here
      // Pick any winner (doesn't matter for owner's score at this node)
      return { maxPts: 0, bestWinner: [...teams1][0] || [...teams2][0] || null };
    }

    if (hasOwnerIn1 && hasOwnerIn2) {
      // Owner's teams could meet each other — only one can win
      // Both earn winPts here, but we can only pick one
      // Pick the one with more teams/downstream potential (they're symmetric in pts here)
      // Just pick slot 1's owner team — earns winPts, the other is eliminated
      return { maxPts: winPts, bestWinner: ownerTeams1[0] };
    }

    // Owner has a team in exactly one slot — it wins, earns winPts
    const winner = hasOwnerIn1 ? ownerTeams1[0] : ownerTeams2[0];
    return { maxPts: winPts, bestWinner: winner };
  }

  function maxPtsFromThirdPlace(ownerId) {
    const { teamOwner } = applyTradesUpTo(data, 'thirdPlace');

    // If already has participants, use normal path
    if (thirdPlaceMatch.team1Id || thirdPlaceMatch.team2Id) {
      return maxPtsFromMatch('thirdPlace', ownerId, null);
    }

    // Derive possible 3rd place participants: losers of each semi
    // A team can reach 3rd place if it could reach a semi but NOT win it
    // i.e. it's in possibleWinnersOf(semi) but the semi has no confirmed winner yet
    const [semi1, semi2] = rounds[3];

    function possibleLosersOf(semi) {
      if (semi.winnerId) {
        // Semi is decided — loser is fixed
        const loser = semi.winnerId === semi.team1Id ? semi.team2Id : semi.team1Id;
        return loser ? new Set([loser]) : new Set();
      }
      // Anyone who could reach this semi could end up as the loser
      return possibleWinnersOf(semi.matchId);
    }

    const losers1 = possibleLosersOf(semi1);
    const losers2 = possibleLosersOf(semi2);

    const ownerIn1 = [...losers1].some(tid => teamOwner[tid] === ownerId);
    const ownerIn2 = [...losers2].some(tid => teamOwner[tid] === ownerId);

    if (!ownerIn1 && !ownerIn2) return { maxPts: 0 };
    // Owner has a team that could reach 3rd place — they can win it for +0.5
    return { maxPts: 0.5 };
  }


  // Now compute max score per owner
  const maxScores = {};
  data.owners.forEach(o => {
    let maxAdditional = 0;

    // All confirmed + all-trades-applied base
    const base = bracketState.ownerEarnedPoints[o.id] ?? bracketState.ownerPoints[o.id] ?? 0;

    // Walk all unplayed matches and sum up best-case points
    rounds.forEach((roundMatches, rIdx) => {
      roundMatches.forEach(m => {
        if (m.winnerId) return; // already played, already counted in base or ownerPoints
        const { maxPts } = maxPtsFromMatch(m.matchId, o.id, rIdx);
        maxAdditional += maxPts;
      });
    });

    // 3rd place
    if (!thirdPlaceMatch.winnerId) {
      const { maxPts } = maxPtsFromThirdPlace(o.id);
      maxAdditional += maxPts;
    }

    // Championship
    if (!champMatch.winnerId) {
      const { maxPts } = maxPtsFromMatch('championship', o.id, null);
      maxAdditional += maxPts;
    }

    maxScores[o.id] = bracketState.ownerPoints[o.id] + maxAdditional;
  });

  return maxScores;
}
