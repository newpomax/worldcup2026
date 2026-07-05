import React from 'react';
import styles from './Leaderboard.module.css';

export default function Leaderboard({ rawData, bracketState, hasSimulation, selectedOwner, onSelectOwner, maxScores = {}, fullPage = false }) {
  const { ownerPoints, ownerEarnedPoints, ownerMap, ownerTeams, teamSimulatedPts, teamElimed, teamSimElimed, teamIsChamp, teamIsThird } = bracketState;

  const sorted = Object.entries(ownerPoints)
    .map(([ownerId, pts]) => ({
      owner: ownerMap[ownerId],
      ptsSimulated: pts,
      ptsEarned: ownerEarnedPoints[ownerId] || 0,
    }))
    .sort((a, b) => b.ptsSimulated - a.ptsSimulated);

  const maxPts = Math.max(...sorted.map(r => r.ptsSimulated), 1);
  const minPts = Math.min(...sorted.map(r => r.ptsSimulated), 0);
  const range = maxPts - Math.min(minPts, 0);

  function fmtPts(n) {
    if (n === 0) return '0';
    const s = Math.abs(n) % 1 === 0 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(1);
    return (n < 0 ? '−' : '') + s;
  }

  function fmtDiff(n) {
    if (n === 0) return null;
    const s = Math.abs(n) % 1 === 0 ? Math.abs(n).toFixed(0) : Math.abs(n).toFixed(1);
    return (n > 0 ? '+' : '−') + s;
  }

  const anySelected = !!selectedOwner;

  return (
    <div className={`${styles.container} ${fullPage ? styles.fullPage : ''}`}>
      {fullPage && <h2 className={styles.pageTitle}>Standings</h2>}
      {hasSimulation && <p className={styles.simNote}>* includes simulated picks</p>}
      <div className={fullPage ? styles.gridFull : styles.grid}>
        {sorted.map((row, idx) => {
          const ownerId = row.owner.id;
          const teams = ownerTeams[ownerId] || [];
          const tournamentGained = row.ptsSimulated - row.ptsEarned;
          const diff = fmtDiff(tournamentGained);
          const barWidth = range > 0 ? Math.max(0, (row.ptsSimulated - Math.min(minPts, 0)) / range) * 100 : 50;
          const isSelected = selectedOwner === ownerId;
          const isDimmed = anySelected && !isSelected;
          const isDisciplineWinner = ownerId === (rawData.discipline_winner || null);

          const sortedTeams = [...teams].sort((a, b) => {
            const aElimed = teamSimElimed[a.id] || false;
            const bElimed = teamSimElimed[b.id] || false;
            const aWins = teamSimulatedPts[a.id] || 0;
            const bWins = teamSimulatedPts[b.id] || 0;
            if (bWins != aWins) return bWins - aWins;
            if (aElimed != bElimed) return aElimed? 1: -1;
            return a.id.localeCompare(b.id);
          });

          const cardEl = (
            <>
              <div className={styles.cardTop}>
                <span className={`${styles.rank} ${fullPage ? styles.rankFull : ''}`}>
                  {idx === 0 ? '🏆' : `#${idx + 1}`}
                </span>
                <span className={`${styles.ownerName} ${fullPage ? styles.ownerNameFull : ''}`}>
                  {row.owner.name}
                </span>
                {isDisciplineWinner && (
                  <span className={styles.disciplineWinner}>
                    <img src="card.png" alt="Discipline Winner" width="15" height="15" />
                  </span>
                )}
                <div className={styles.pts}>
                  <span className={`${styles.ptsTotal} ${fullPage ? styles.ptsTotalFull : ''} ${row.pts < 0 ? styles.negative : ''}`}>
                    {fmtPts(row.ptsSimulated)}
                  </span>
                  {diff && (
                    <span className={`${styles.ptsDiff} ${fullPage ? styles.ptsDiffFull : ''} ${tournamentGained >= 0 ? styles.pos : styles.neg}`}>
                      {diff}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.barWrap}>
                <div className={`${styles.barTrack} ${fullPage ? styles.barTrackFull : ''}`}>
                  <div className={styles.barFill} style={{ width: `${barWidth}%` }} />
                </div>
              </div>
              <div className={styles.cardBottom}>
              <div className={styles.teamList}>
                {sortedTeams.map(t => {
                  const wins = teamSimulatedPts[t.id] || 0;
                  const isChamp = teamIsChamp[t.id];
                  const isThird = teamIsThird[t.id];
                  const isElim = teamElimed[t.id];
                  const isSimElim = teamSimElimed[t.id];

                  return (
                    <span
                      key={t.id}
                      className={`${styles.pill} ${fullPage ? styles.pillFull : ''}
                        ${isChamp ? styles.pillChamp : ''}
                        ${isThird ? styles.pillThird : ''}
                        ${(!isSimElim && wins > 0 && !isChamp && !isThird) ? styles.pillWin : ''}
                        ${!isThird && !isChamp && isSimElim? (isElim ? styles.pillElim : (isSimElim ? styles.pillSimElim : styles.pillOther)): ''}
                      `}
                    >
                      {t.name}
                      {wins > 0 && (
                        <span className={styles.pillWins}>
                          {isChamp ? '★' : isThird ? '③' : `+${wins % 1 === 0 ? wins.toFixed(0) : wins.toFixed(1)}`}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              {fullPage && maxScores[ownerId] != null && (
                <span className={styles.ptsMax}>
                  ({fmtPts(maxScores[ownerId])} pts max)
                </span>
              )}
              </div>
            </>
          );

          if (fullPage) {
            return (
              <div
                key={ownerId}
                className={`${styles.card} ${styles.cardFull} ${idx === 0 ? styles.leader : ''}`}
              >
                {cardEl}
              </div>
            );
          }

          return (
            <button
              key={ownerId}
              className={`${styles.card}
                ${idx === 0 ? styles.leader : ''}
                ${isSelected ? styles.selected : ''}
                ${isDimmed ? styles.dimmed : ''}
              `}
              onClick={() => onSelectOwner(ownerId)}
              title={isSelected ? 'Click to deselect' : `Highlight ${row.owner.name}'s teams`}
            >
              {cardEl}
            </button>
          );
        })}
      </div>
    </div>
  );
}
