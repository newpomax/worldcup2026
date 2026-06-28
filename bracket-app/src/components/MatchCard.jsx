import React from 'react';
import styles from './MatchCard.module.css';

/**
 * Renders a single match with two team slots.
 *
 * Props:
 *   match         - { matchId, team1Id, team2Id, winnerId }
 *   teamMap       - id → team object
 *   ownerMap      - id → owner object
 *   confirmedResults - raw results from JSON (not simulated)
 *   roundKey      - 'round1' | 'round2' | ... | 'championship' | 'thirdPlace'
 *   onPick(matchId, teamId|null) - called when user clicks a team
 *   isChampionship / isThirdPlace - styling flags
 */
export default function MatchCard({
  match,
  teamMap,
  ownerMap,
  confirmedResults,
  roundKey,
  onPick,
  isChampionship = false,
  isThirdPlace = false,
}) {
  if (!match) return null;

  const { matchId, team1Id, team2Id, winnerId } = match;

  const team1 = team1Id ? teamMap[team1Id] : null;
  const team2 = team2Id ? teamMap[team2Id] : null;

  // Is the result confirmed (in the source JSON)?
  let confirmedWinnerId = null;
  if (isChampionship) {
    confirmedWinnerId = confirmedResults?.championship || null;
  } else if (isThirdPlace) {
    confirmedWinnerId = confirmedResults?.thirdPlace || null;
  } else {
    confirmedWinnerId = confirmedResults?.[roundKey]?.[matchId] || null;
  }

  const isLocked = !!confirmedWinnerId;
  const bothTeamsReady = !!team1Id && !!team2Id;

  function handleTeamClick(teamId) {
    if (isLocked || !bothTeamsReady || !teamId) return;
    // Toggle: clicking the current simulated winner clears it
    onPick(matchId, winnerId === teamId ? null : teamId);
  }

  return (
    <div className={`
      ${styles.card}
      ${isChampionship ? styles.championship : ''}
      ${isThirdPlace ? styles.thirdPlace : ''}
    `}>
      <TeamSlot
        team={team1}
        owner={team1 ? ownerMap[team1?.owner] : null}
        isWinner={!!winnerId && winnerId === team1Id}
        isLoser={!!winnerId && winnerId !== team1Id && !!team1Id}
        isLocked={isLocked}
        canClick={!isLocked && bothTeamsReady && !!team1Id}
        onClick={() => handleTeamClick(team1Id)}
        isChampionship={isChampionship}
      />
      <div className={styles.divider} />
      <TeamSlot
        team={team2}
        owner={team2 ? ownerMap[team2?.owner] : null}
        isWinner={!!winnerId && winnerId === team2Id}
        isLoser={!!winnerId && winnerId !== team2Id && !!team2Id}
        isLocked={isLocked}
        canClick={!isLocked && bothTeamsReady && !!team2Id}
        onClick={() => handleTeamClick(team2Id)}
        isChampionship={isChampionship}
      />
    </div>
  );
}

function TeamSlot({ team, owner, isWinner, isLoser, isLocked, canClick, onClick, isChampionship }) {
  if (!team) {
    return (
      <div className={`${styles.slot} ${styles.empty} ${isChampionship ? styles.champSlotHeight : ''}`}>
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
