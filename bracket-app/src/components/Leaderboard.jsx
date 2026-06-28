import React from 'react';
import styles from './Leaderboard.module.css';

export default function Leaderboard({ rawData, bracketState, hasSimulation }) {
  const { ownerPoints, ownerMap, teamMap, rounds, thirdPlaceMatch, champMatch } = bracketState;

  // Sort owners by total points desc
  const sorted = Object.entries(ownerPoints)
    .map(([ownerId, pts]) => ({
      owner: ownerMap[ownerId],
      pts,
      initial: rawData.owners.find(o => o.id === ownerId)?.initialPoints || 0,
    }))
    .sort((a, b) => b.pts - a.pts);

  // Build a map: owner → their teams + how many wins each got
  const ownerTeams = {};
  rawData.owners.forEach(o => { ownerTeams[o.id] = []; });
  rawData.teams.forEach(t => {
    if (ownerTeams[t.owner]) ownerTeams[t.owner].push({ ...t, wins: 0, isChamp: false, isThird: false });
  });

  // Count wins per team
  const allMatches = [...rounds.flat(), thirdPlaceMatch, champMatch];
  allMatches.forEach(match => {
    if (!match?.winnerId) return;
    for (const ownerId of Object.keys(ownerTeams)) {
      const team = ownerTeams[ownerId].find(t => t.id === match.winnerId);
      if (team) {
        if (match.matchId === 'championship') {
          team.wins += 2; // +1 win + 1 bonus
          team.isChamp = true;
        } else if (match.matchId === 'thirdPlace') {
          team.wins += 0.5;
          team.isThird = true;
        } else {
          team.wins += 1;
        }
      }
    }
  });

  const maxPts = sorted[0]?.pts || 1;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Owner Standings</h2>
        {hasSimulation && (
          <span className={styles.simNote}>* includes simulated picks</span>
        )}
      </div>

      <div className={styles.table}>
        {sorted.map((row, idx) => {
          const gained = row.pts - row.initial;
          const ownerId = row.owner.id;
          const teams = ownerTeams[ownerId] || [];
          const activeTeams = teams.filter(t => t.wins > 0);
          const elimTeams = teams.filter(t => t.wins === 0);

          return (
            <div key={ownerId} className={`${styles.row} ${idx === 0 ? styles.leader : ''}`}>
              <div className={styles.rank}>
                {idx === 0 ? '🏆' : `#${idx + 1}`}
              </div>

              <div className={styles.ownerInfo}>
                <div className={styles.ownerName}>{row.owner.name}</div>
                <div className={styles.teamList}>
                  {activeTeams.map(t => (
                    <span key={t.id} className={`${styles.teamPill} ${t.isChamp ? styles.champTeam : t.isThird ? styles.thirdTeam : styles.winTeam}`}>
                      {t.name}
                      <span className={styles.teamWins}>+{t.wins}</span>
                    </span>
                  ))}
                  {elimTeams.map(t => (
                    <span key={t.id} className={`${styles.teamPill} ${styles.elimTeam}`}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.pointsBlock}>
                <div className={styles.totalPts}>
                  {row.pts % 1 === 0 ? row.pts.toFixed(0) : row.pts.toFixed(1)}
                </div>
                <div className={styles.pointsBreakdown}>
                  <span className={styles.initial}>{row.initial}</span>
                  {gained > 0 && <span className={styles.gained}> +{gained % 1 === 0 ? gained.toFixed(0) : gained.toFixed(1)}</span>}
                </div>
                <div className={styles.bar}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(row.pts / maxPts) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
