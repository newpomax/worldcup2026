import React from 'react';
import { getRoundLabelByKey, applyTradesUpTo } from '../bracketLogic';
import styles from './TradeHistory.module.css';

export default function TradeHistory({ rawData, bracketState }) {
  const trades = rawData.trades || [];
  const { ownerMap, teamMap } = bracketState;

  if (trades.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Trade History</h2>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🤝</span>
          <p>No trades recorded yet.</p>
          <p className={styles.emptyHint}>Add entries to the <code>trades</code> array in <code>bracket.json</code>.</p>
        </div>
      </div>
    );
  }

  // Group trades by round
  const byRound = {};
  trades.forEach((trade, i) => {
    const key = String(trade.round);
    if (!byRound[key]) byRound[key] = [];
    byRound[key].push({ ...trade, _idx: i });
  });

  // Sort rounds
  const ROUND_ORDER = ['1', '2', '3', '4', 'thirdPlace', 'championship'];
  const sortedRoundKeys = Object.keys(byRound).sort((a, b) => {
    const ai = ROUND_ORDER.indexOf(a);
    const bi = ROUND_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Trade History</h2>
      <p className={styles.subtitle}>
        Trades are listed by when they take effect. Team ownership and points adjust at the start of each round.
      </p>

      <div className={styles.timeline}>
        {sortedRoundKeys.map(roundKey => {
          const roundTrades = byRound[roundKey];
          const roundLabel = getRoundLabelByKey(isNaN(roundKey) ? roundKey : Number(roundKey));
          return (
            <div key={roundKey} className={styles.roundGroup}>
              <div className={styles.roundHeader}>
                <span className={styles.roundPill}>Before {roundLabel}</span>
              </div>
              <div className={styles.tradeList}>
                {roundTrades.map((trade, ti) => (
                  <TradeCard key={ti} trade={trade} ownerMap={ownerMap} teamMap={teamMap} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current rosters post all trades */}
      <div className={styles.rosterSection}>
        <h3 className={styles.rosterTitle}>Current Rosters</h3>
        <CurrentRosters rawData={rawData} bracketState={bracketState} />
      </div>
    </div>
  );
}

function TradeCard({ trade, ownerMap, teamMap }) {
  const { partyA, partyB } = trade;
  const ownerA = ownerMap[partyA.owner];
  const ownerB = ownerMap[partyB.owner];

  const aTeams = partyA.teams_given || [];
  const bTeams = partyB.teams_given || [];
  const aPts = partyA.points_given || 0;
  const bPts = partyB.points_given || 0;

  const hasContent = aTeams.length > 0 || bTeams.length > 0 || aPts !== 0 || bPts !== 0;

  return (
    <div className={styles.tradeCard}>
      <TradeSide
        owner={ownerA}
        teamsGiven={aTeams}
        pointsGiven={aPts}
        teamMap={teamMap}
        receivingOwner={ownerB}
      />
      <div className={styles.tradeArrow}>⇄</div>
      <TradeSide
        owner={ownerB}
        teamsGiven={bTeams}
        pointsGiven={bPts}
        teamMap={teamMap}
        receivingOwner={ownerA}
        flip
      />
    </div>
  );
}

function TradeSide({ owner, teamsGiven, pointsGiven, teamMap, receivingOwner, flip }) {
  const hasTeams = teamsGiven.length > 0;
  const hasPts = pointsGiven !== 0;
  const isEmpty = !hasTeams && !hasPts;

  return (
    <div className={`${styles.side} ${flip ? styles.sideRight : ''}`}>
      <div className={styles.sideOwner}>{owner?.name || '?'}</div>
      <div className={styles.sideLabel}>gives</div>
      {isEmpty && <span className={styles.nothing}>—</span>}
      {hasTeams && (
        <div className={styles.sideTeams}>
          {teamsGiven.map(tid => {
            const team = teamMap[tid];
            return (
              <span key={tid} className={styles.tradeTeamPill}>
                {team?.name || tid}
              </span>
            );
          })}
        </div>
      )}
      {hasPts && (
        <span className={`${styles.tradePts} ${pointsGiven > 0 ? styles.tradePtsPos : styles.tradePtsNeg}`}>
          {pointsGiven > 0 ? `+${pointsGiven}` : pointsGiven} pts
        </span>
      )}
    </div>
  );
}

function CurrentRosters({ rawData, bracketState }) {
  const { ownerTeams, teamSimulatedPts, teamElimed, teamSimElimed, teamIsChamp, teamIsThird } = bracketState;

  const owners = rawData.owners.map(o => ({
    owner: o,
    teams: ownerTeams[o.id] || [],
  }));

  return (
    <div className={styles.rosterGrid}>
      {owners.map(({ owner, teams }) => {
        const sorted = [...teams].sort((a, b) => {
          const aElimed = teamSimElimed[a.id] || false;
          const bElimed = teamSimElimed[b.id] || false;
          const aWins = teamSimulatedPts[a.id] || 0;
          const bWins = teamSimulatedPts[b.id] || 0;
          if (bWins != aWins) return bWins - aWins;
          if (aElimed != bElimed) return aElimed? 1: -1;
          return a.id.localeCompare(b.id);
        });
        return (
          <div key={owner.id} className={styles.rosterCard}>
            <div className={styles.rosterOwner}>{owner.name}</div>
            <div className={styles.rosterTeams}>
              {sorted.map(t => {
                const wins = teamSimulatedPts[t.id] || 0;
                const isElim = teamElimed[t.id] || false;
                const isSimElim = teamSimElimed[t.id] || false;
                return (
                  <span key={t.id} className={`${styles.rosterPill}
                    ${teamIsChamp[t.id] ? styles.pillChamp : ''}
                    ${teamIsThird[t.id] ? styles.pillThird : ''}
                    ${!isSimElim && wins > 0 && !teamIsChamp[t.id] && !teamIsThird[t.id] ? styles.pillWin : ''}
                    ${wins == 0? (isElim ? styles.pillElim : (isSimElim ? styles.pillSimElim : styles.pillOther)): ''}
                  `}>
                    {t.name}
                  </span>
                );
              })}
              {sorted.length === 0 && <span className={styles.noTeams}>No teams</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
