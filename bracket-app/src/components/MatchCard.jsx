import React from 'react';
import styles from './MatchCard.module.css';
import { applyTradesUpTo } from '../bracketLogic';

/**
 * Renders a single match with two team slots.
 *
 * highlightedTeams: Set<teamId> | null
 *   When non-null, slots whose team is in the set are highlighted (bright border + glow);
 *   slots not in the set are dimmed.
 */
export default function MatchCard({
  match,
  teamMap,
  ownerMap,
  postTradeOwnerMap,
  confirmedResults,
  roundKey,
  onPick,
  isChampionship = false,
  isThirdPlace = false,
  highlightedTeams = null,
}) {
  if (!match) return null;

  const { matchId, team1Id, team2Id, winnerId } = match;
  const roundNum = Number(matchId.split('m')[0]?.replace(/r/g, '')) || 0;
  console.log(`Round Num: ${roundNum}`);

  const team1 = team1Id ? teamMap[team1Id] : null;
  const team2 = team2Id ? teamMap[team2Id] : null;

  let confirmedWinnerId = null;
  if (isChampionship) {
    confirmedWinnerId = confirmedResults?.championship || null;
  } else if (isThirdPlace) {
    confirmedWinnerId = confirmedResults?.thirdPlace || null;
  } else {
    confirmedWinnerId = confirmedResults?.[roundKey]?.[matchId] || null;
  }

  const isLocked = !!confirmedWinnerId;

  function handleTeamClick(teamId) {
    if (isLocked || !teamId) return;
    onPick(matchId, winnerId === teamId ? null : teamId);
  }

  // Highlight logic per slot
  function slotHighlight(teamId) {
    if (!highlightedTeams) return 'none';        // no filter active
    if (!teamId) return 'none';
    return highlightedTeams.has(teamId) ? 'highlight' : 'dim';
  }
  const effectiveOwnerMap = postTradeOwnerMap[roundNum] ?? {};
  const team1Owner = effectiveOwnerMap[team1Id];
  const team2Owner = effectiveOwnerMap[team2Id];
  console.log(`${team1Id}: ${effectiveOwnerMap[team1Id]}`);
  console.log(`${team2Id}: ${effectiveOwnerMap[team2Id]}`);

  return (
    <div className={`
      ${styles.card}
      ${isChampionship ? styles.championship : ''}
      ${isThirdPlace ? styles.thirdPlace : ''}
    `}>
      <TeamSlot
        team={team1}
        owner={team1 ? ownerMap[team1Owner] : null}
        isWinner={!!winnerId && winnerId === team1Id}
        isLoser={!!winnerId && winnerId !== team1Id && !!team1Id}
        isLocked={isLocked}
        canClick={!isLocked && !!team1Id}
        onClick={() => handleTeamClick(team1Id)}
        isChampionship={isChampionship}
        highlight={slotHighlight(team1Id)}
      />
      <div className={styles.divider} />
      <TeamSlot
        team={team2}
        owner={team2 ? ownerMap[team2Owner] : null}
        isWinner={!!winnerId && winnerId === team2Id}
        isLoser={!!winnerId && winnerId !== team2Id && !!team2Id}
        isLocked={isLocked}
        canClick={!isLocked && !!team2Id}
        onClick={() => handleTeamClick(team2Id)}
        isChampionship={isChampionship}
        highlight={slotHighlight(team2Id)}
      />
    </div>
  );
}

function TeamSlot({ team, owner, isWinner, isLoser, isLocked, canClick, onClick, isChampionship, highlight }) {
  // highlight: 'none' | 'highlight' | 'dim'
  const isHighlighted = highlight === 'highlight';
  const isDimmed = highlight === 'dim';

  if (!team) {
    return (
      <div className={`${styles.slot} ${styles.empty} ${isChampionship ? styles.champSlotHeight : ''} ${isDimmed ? styles.slotDim : ''}`}>
        <span className={styles.tbdLabel}>TBD</span>
      </div>
    );
  }

  return (
    <button
      className={`
        ${styles.slot}
        ${isWinner ? styles.winner : ''}
        ${isLoser ? styles.loser : ''}
        ${canClick ? styles.clickable : ''}
        ${isChampionship ? styles.champSlotHeight : ''}
        ${isHighlighted ? styles.slotHighlight : ''}
        ${isDimmed ? styles.slotDim : ''}
      `}
      onClick={canClick ? onClick : undefined}
      disabled={!canClick}
      title={canClick ? `Pick ${team.name} to advance` : undefined}
      type="button"
    >
      <div className={styles.slotInner}>
        {team.seed != null && (
          <span className={styles.seed}>{team.seed}</span>
        )}
        <div className={styles.teamInfo}>
          <span className={styles.teamName}>{team.name}</span>
          {owner && <span className={styles.ownerName}>{owner.name}</span>}
        </div>
        {isWinner && (
          <span className={`${styles.badge} ${isLocked ? styles.badgeLocked : styles.badgeSim}`}>
            {isLocked ? '✓' : '›'}
          </span>
        )}
      </div>
    </button>
  );
}
