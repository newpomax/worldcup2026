import React from 'react';
import { getRoundLabel, getEverOwnedTeams } from '../bracketLogic';
import MatchCard from './MatchCard';
import styles from './BracketView.module.css';

const SLOT_HEIGHT = 100;
const HALF_SLOTS = 8;
const COL_HEIGHT = HALF_SLOTS * SLOT_HEIGHT;
const COL_WIDTH = 196;
const OVERLAP = 40; // px overlap applied from QF (rIdx >= 2) onward

// Returns the negative margin to pull a left-side column back over the previous one.
// rIdx is the round index (0=R1, 1=R2, 2=QF, 3=SF).
// Right-side columns are rendered R4→R1, so their overlap is mirrored.
function colOverlap(rIdx) {
  return rIdx >= 2 ? -OVERLAP : 0;
}

export default function BracketView({
  rawData,
  bracketState,
  simulatedResults,
  confirmedResults,
  onPick,
  selectedOwner,
}) {
  const { teamMap, ownerMap, postTradeOwnerMap, rounds, thirdPlaceMatch, champMatch } = bracketState;

  const halves = rounds.map(r => ({
    top: r.slice(0, r.length / 2),
    bottom: r.slice(r.length / 2),
  }));

  const roundKeys = ['round1', 'round2', 'round3', 'round4'];
  const roundLabels = rounds.map((_, i) => getRoundLabel(i));

  const sharedProps = { teamMap, ownerMap, postTradeOwnerMap, confirmedResults, onPick, selectedOwner };

  return (
    <div className={styles.container}>
      <div className={styles.bracketScroll}>

        {/* Column headers */}
        <div className={styles.headers}>
          {rounds.map((_, i) => (
            <div key={`lh-${i}`} className={styles.headerCell} style={{ width: COL_WIDTH, marginLeft: colOverlap(i), flexShrink: 0 }}>
              {roundLabels[i]}
            </div>
          ))}
          <div className={`${styles.headerCell} ${styles.headerCenter}`} style={{ width: 220, flexShrink: 0, marginLeft: -98, marginRight: -98 }}>
            Final
          </div>
          {[...rounds].reverse().map((_, i) => {
            const rIdx = rounds.length - 1 - i;
            return (
              <div key={`rh-${rIdx}`} className={styles.headerCell} style={{ width: COL_WIDTH, marginRight: colOverlap(rIdx), flexShrink: 0 }}>
                {roundLabels[rIdx]}
              </div>
            );
          })}
        </div>

        {/* Bracket body */}
        <div className={styles.body}>

          {/* Left side: top half R1→R4 */}
          {rounds.map((_, rIdx) => (
            <RoundColumn
              key={`left-${rIdx}`}
              matches={halves[rIdx].top}
              totalSlots={HALF_SLOTS}
              roundKey={roundKeys[rIdx]}
              width={COL_WIDTH}
              marginLeft={colOverlap(rIdx)}
              zIndex={rIdx + 1}
              {...sharedProps}
            />
          ))}

          {/* Center */}
          <div className={styles.centerCol}>
            <div className={styles.centerTop}>
              <div className={styles.centerLabel}>Championship</div>
              <MatchCard
                match={champMatch}
                roundKey="championship"
                isChampionship
                {...sharedProps}
              />
            </div>
            <div className={styles.centerBottom}>
              <div className={styles.thirdPlaceLabel}>3rd Place</div>
              <MatchCard
                match={thirdPlaceMatch}
                roundKey="thirdPlace"
                isThirdPlace
                {...sharedProps}
              />
            </div>
          </div>

          {/* Right side: bottom half R4→R1 */}
          {[...rounds].reverse().map((_, i) => {
            const rIdx = rounds.length - 1 - i;
            // Right side renders R4 first (i=0,rIdx=3) → R1 last (i=3,rIdx=0)
            // Overlap applies when rIdx >= 2 (QF and SF), same threshold as left side
            return (
              <RoundColumn
                key={`right-${rIdx}`}
                matches={halves[rIdx].bottom}
                totalSlots={HALF_SLOTS}
                roundKey={roundKeys[rIdx]}
                width={COL_WIDTH}
                marginRight={colOverlap(rIdx)}
                zIndex={rIdx + 1}
                flip
                {...sharedProps}
              />
            );
          })}
        </div>
      </div>

      <PointsLegend />
    </div>
  );
}

function RoundColumn({ matches, totalSlots, teamMap, ownerMap, postTradeOwnerMap, confirmedResults, roundKey, onPick, selectedOwner, width, flip, marginLeft = 0, marginRight = 0, zIndex = 1 }) {
  const slotsPerMatch = totalSlots / matches.length;

  return (
    <div style={{
      width,
      height: COL_HEIGHT,
      position: 'relative',
      flexShrink: 0,
      marginLeft,
      marginRight,
      zIndex,
    }}>
      {matches.map((match, i) => {
        const groupCenter = (i + 0.5) * slotsPerMatch;
        const topPx = (groupCenter - 0.5) * SLOT_HEIGHT;
        return (
          <div
            key={match.matchId}
            style={{
              position: 'absolute',
              top: topPx,
              left: flip ? 16 : 0,
              right: flip ? 0 : 16,
            }}
          >
            <MatchCard
              match={match}
              teamMap={teamMap}
              ownerMap={ownerMap}
              postTradeOwnerMap={postTradeOwnerMap}
              confirmedResults={confirmedResults}
              roundKey={roundKey}
              onPick={onPick}
              selectedOwner={selectedOwner}
            />
          </div>
        );
      })}
    </div>
  );
}

function PointsLegend() {
  return (
    <div className={styles.legend}>
      <span className={styles.legendTitle}>Scoring</span>
      <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--gold)' }} /> Each win: +1 pt</span>
      <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#c084fc' }} /> Championship win: +2 pts (win + bonus)</span>
      <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--green)' }} /> 3rd place win: +0.5 pts</span>
      <span className={styles.legendHint}>Click any team in an upcoming match to simulate a winner · Click an owner above to highlight their teams</span>
    </div>
  );
}
