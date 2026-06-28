import React from 'react';
import { getRoundLabel } from '../bracketLogic';
import MatchCard from './MatchCard';
import styles from './BracketView.module.css';

/**
 * Full bracket layout. 32 teams, 4 rounds + championship + 3rd place.
 *
 * Visual structure (left to right):
 *   [R1 top 8] [R2 top 4] [R3 top 2] [R4 top semi] [CHAMP] [R4 bot semi] [R3 bot 2] [R2 bot 4] [R1 bot 8]
 *                                                            [3RD PLACE]
 *
 * Each column's matches are vertically centered in their slot groups.
 * The number of slots per column = 8 (half of 16 R1 matches).
 */

const SLOT_HEIGHT = 100; // px - height of one "slot" (one R1 match position)
const HALF_SLOTS = 8;    // 8 R1 matches per half-bracket
const COL_HEIGHT = HALF_SLOTS * SLOT_HEIGHT; // 800px

export default function BracketView({
  rawData,
  bracketState,
  simulatedResults,
  confirmedResults,
  onPick,
}) {
  const { teamMap, ownerMap, rounds, thirdPlaceMatch, champMatch } = bracketState;

  // Split each round into top/bottom halves
  // rounds[0] has 16 matches → top: 0..7, bottom: 8..15
  // rounds[1] has 8 matches  → top: 0..3, bottom: 4..7
  // rounds[2] has 4 matches  → top: 0..1, bottom: 2..3
  // rounds[3] has 2 matches  → top: [0],  bottom: [1]
  const halves = rounds.map(r => ({
    top: r.slice(0, r.length / 2),
    bottom: r.slice(r.length / 2),
  }));

  const roundKeys = ['round1', 'round2', 'round3', 'round4'];

  // The top bracket reads left→right, bottom bracket reads right→left visually,
  // but we render them in the same column order
  const roundLabels = rounds.map((_, i) => getRoundLabel(i));

  return (
    <div className={styles.container}>
      <div className={styles.bracketScroll}>

        {/* Column headers row */}
        <div className={styles.headers}>
          {/* Left side: rounds in order R1→R4 */}
          {rounds.map((_, i) => (
            <div key={`lh-${i}`} className={styles.headerCell} style={{ width: COL_WIDTH(i) }}>
              {roundLabels[i]}
            </div>
          ))}
          {/* Center */}
          <div className={`${styles.headerCell} ${styles.headerCenter}`} style={{ width: 220 }}>
            Final
          </div>
          {/* Right side: rounds in reverse order R4→R1 */}
          {[...rounds].reverse().map((_, i) => {
            const rIdx = rounds.length - 1 - i;
            return (
              <div key={`rh-${rIdx}`} className={styles.headerCell} style={{ width: COL_WIDTH(rIdx) }}>
                {roundLabels[rIdx]}
              </div>
            );
          })}
        </div>

        {/* Bracket body */}
        <div className={styles.body}>

          {/* Left side: top half, R1→R4 */}
          {rounds.map((_, rIdx) => (
            <RoundColumn
              key={`left-${rIdx}`}
              matches={halves[rIdx].top}
              totalSlots={HALF_SLOTS}
              teamMap={teamMap}
              ownerMap={ownerMap}
              confirmedResults={confirmedResults}
              roundKey={roundKeys[rIdx]}
              onPick={onPick}
              width={COL_WIDTH(rIdx)}
            />
          ))}

          {/* Center: Championship + 3rd place */}
          <div className={styles.centerCol}>
            <div className={styles.centerTop}>
              <div className={styles.centerLabel}>Championship</div>
              <MatchCard
                match={champMatch}
                teamMap={teamMap}
                ownerMap={ownerMap}
                confirmedResults={confirmedResults}
                roundKey="championship"
                onPick={onPick}
                isChampionship
              />
            </div>
            <div className={styles.centerBottom}>
              <div className={styles.thirdPlaceLabel}>3rd Place</div>
              <MatchCard
                match={thirdPlaceMatch}
                teamMap={teamMap}
                ownerMap={ownerMap}
                confirmedResults={confirmedResults}
                roundKey="thirdPlace"
                onPick={onPick}
                isThirdPlace
              />
            </div>
          </div>

          {/* Right side: bottom half, R4→R1 */}
          {[...rounds].reverse().map((_, i) => {
            const rIdx = rounds.length - 1 - i;
            return (
              <RoundColumn
                key={`right-${rIdx}`}
                matches={halves[rIdx].bottom}
                totalSlots={HALF_SLOTS}
                teamMap={teamMap}
                ownerMap={ownerMap}
                confirmedResults={confirmedResults}
                roundKey={roundKeys[rIdx]}
                onPick={onPick}
                width={COL_WIDTH(rIdx)}
                flip
              />
            );
          })}
        </div>
      </div>

      <PointsLegend />
    </div>
  );
}

// Column width narrows as rounds progress (more breathing room)
function COL_WIDTH(roundIndex) {
  return 196;
}

/**
 * A single vertical column of matches.
 * Matches are centered within their slot groups.
 * totalSlots = 8 (half of round-1 matches).
 * As round advances, slotsPerMatch doubles.
 */
function RoundColumn({ matches, totalSlots, teamMap, ownerMap, confirmedResults, roundKey, onPick, width, flip }) {
  const slotsPerMatch = totalSlots / matches.length;

  return (
    <div className={styles.roundCol} style={{ width, height: COL_HEIGHT, position: 'relative', flexShrink: 0 }}>
      {matches.map((match, i) => {
        const groupCenter = (i + 0.5) * slotsPerMatch; // in slot units
        const topPx = (groupCenter - 0.5) * SLOT_HEIGHT; // center a single card (1 slot tall)
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
              confirmedResults={confirmedResults}
              roundKey={roundKey}
              onPick={onPick}
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
      <span className={styles.legendHint}>Click any team in an upcoming match to simulate a winner</span>
    </div>
  );
}
