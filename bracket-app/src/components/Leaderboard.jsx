import React from 'react';
import styles from './Leaderboard.module.css';

export default function Leaderboard({ rawData, bracketState, hasSimulation, selectedOwner, onSelectOwner, fullPage = false }) {
  const { ownerPoints, ownerInitialPoints, ownerTransferredPoints, ownerMap, ownerTeams, teamWins, teamIsChamp, teamIsThird } = bracketState;

  const sorted = Object.entries(ownerPoints)
    .map(([ownerId, pts]) => ({
      owner: ownerMap[ownerId],
      pts,
      initial: (ownerInitialPoints[ownerId] || 0) + (ownerTransferredPoints[ownerId] || 0),
    }))
    .sort((a, b) => b.pts - a.pts);

  const maxPts = Math.max(...sorted.map(r => r.pts), 1);
  const minPts = Math.min(...sorted.map(r => r.pts), 0);
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
          const tournamentGained = row.pts - row.initial;
          const diff = fmtDiff(tournamentGained);
          const barWidth = range > 0 ? Math.max(0, (row.pts - Math.min(minPts, 0)) / range) * 100 : 50;
          const isSelected = selectedOwner === ownerId;
          const isDimmed = anySelected && !isSelected;

          const sortedTeams = [...teams].sort((a, b) => (teamWins[b.id] || 0) - (teamWins[a.id] || 0));

          const cardEl = (
            <>
              <div className={styles.cardTop}>
                <span className={`${styles.rank} ${fullPage ? styles.rankFull : ''}`}>
                  {idx === 0 ? '🏆' : `#${idx + 1}`}
                </span>
                <span className={`${styles.ownerName} ${fullPage ? styles.ownerNameFull : ''}`}>
                  {row.owner.name}
                </span>
                <div className={styles.pts}>
                  <span className={`${styles.ptsTotal} ${fullPage ? styles.ptsTotalFull : ''} ${row.pts < 0 ? styles.negative : ''}`}>
                    {fmtPts(row.pts)}
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

              <div className={styles.teamList}>
                {sortedTeams.map(t => {
                  const wins = teamWins[t.id] || 0;
                  const isChamp = teamIsChamp[t.id];
                  const isThird = teamIsThird[t.id];
                  const isElim = wins === 0;
                  return (
                    <span
                      key={t.id}
                      className={`${styles.pill} ${fullPage ? styles.pillFull : ''}
                        ${isChamp ? styles.pillChamp : ''}
                        ${isThird ? styles.pillThird : ''}
                        ${wins > 0 && !isChamp && !isThird ? styles.pillWin : ''}
                        ${isElim ? styles.pillElim : ''}
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
