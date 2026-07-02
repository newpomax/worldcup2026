import React, { useState, useEffect, useCallback } from 'react';
import { buildBracket, applyPick, computeMaxScores } from './bracketLogic';
import BracketView from './components/BracketView';
import Leaderboard from './components/Leaderboard';
import TradeHistory from './components/TradeHistory';
import styles from './App.module.css';

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [confirmedResults, setConfirmedResults] = useState(null);
  const [simulatedResults, setSimulatedResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('bracket');
  const [selectedOwner, setSelectedOwner] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}bracket.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load bracket.json (${r.status})`);
        return r.json();
      })
      .then(data => {
        setRawData(data);
        setConfirmedResults(data.results);
        setSimulatedResults(data.results);
      })
      .catch(err => setError(err.message));
  }, []);

  const handlePick = useCallback((matchId, winnerId) => {
    if (!rawData || !simulatedResults) return;
    const state = buildBracket(rawData, simulatedResults, confirmedResults);
    const next = applyPick(simulatedResults, matchId, winnerId, rawData, state);
    setSimulatedResults(next);
  }, [rawData, simulatedResults, confirmedResults]);

  const handleReset = useCallback(() => {
    if (confirmedResults) setSimulatedResults(JSON.parse(JSON.stringify(confirmedResults)));
  }, [confirmedResults]);

  const handleSelectOwner = useCallback((ownerId) => {
    setSelectedOwner(prev => prev === ownerId ? null : ownerId);
  }, []);

  const hasSimulation = simulatedResults && confirmedResults &&
    JSON.stringify(simulatedResults) !== JSON.stringify(confirmedResults);

  if (error) {
    return (
      <div className={styles.errorScreen}>
        <h2>Failed to load bracket</h2>
        <p>{error}</p>
        <p className={styles.hint}>Make sure <code>bracket.json</code> is in the <code>public/</code> folder.</p>
      </div>
    );
  }

  if (!rawData) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading bracket…</p>
      </div>
    );
  }

  const bracketState = buildBracket(rawData, simulatedResults, confirmedResults);
  const maxScores = computeMaxScores(rawData, confirmedResults, bracketState);
  const tradeCount = (rawData.trades || []).length;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleBlock}>
            <span className={styles.trophy}>🏆</span>
            <div>
              <h1 className={styles.title}>{rawData.tournament?.name || 'Tournament Bracket'}</h1>
              {rawData.tournament?.season && (
                <span className={styles.season}>{rawData.tournament.season}</span>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'bracket' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('bracket')}
              >Bracket</button>
              <button
                className={`${styles.tab} ${activeTab === 'standings' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('standings')}
              >Standings</button>
              <button
                className={`${styles.tab} ${activeTab === 'trades' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('trades')}
              >
                Trades
                {tradeCount > 0 && <span className={styles.tabBadge}>{tradeCount}</span>}
              </button>
            </div>
            {hasSimulation && (
              <button className={styles.resetBtn} onClick={handleReset}>
                ↺ Reset simulation
              </button>
            )}
          </div>
        </div>
        {hasSimulation && (
          <div className={styles.simBanner}>
            Simulated picks active — click a team to change, or reset to confirmed results
          </div>
        )}
      </header>

      <main className={styles.main}>
        {activeTab === 'bracket' ? (
          <>
            <Leaderboard
              rawData={rawData}
              bracketState={bracketState}
              hasSimulation={hasSimulation}
              selectedOwner={selectedOwner}
              onSelectOwner={handleSelectOwner}
              maxScores={maxScores}
            />
            <div className={styles.bracketDivider}>
              {selectedOwner && (
                <span className={styles.filterNote}>
                  Showing teams for <strong>{bracketState.ownerMap[selectedOwner]?.name}</strong>
                  <button className={styles.clearFilter} onClick={() => setSelectedOwner(null)}>✕ clear</button>
                </span>
              )}
            </div>
            <BracketView
              rawData={rawData}
              bracketState={bracketState}
              simulatedResults={simulatedResults}
              confirmedResults={confirmedResults}
              onPick={handlePick}
              selectedOwner={selectedOwner}
            />
          </>
        ) : activeTab === 'standings' ? (
          <Leaderboard
            rawData={rawData}
            bracketState={bracketState}
            hasSimulation={hasSimulation}
            selectedOwner={null}
            onSelectOwner={() => {}}
            maxScores={maxScores}
            fullPage
          />
        ) : (
          <TradeHistory
            rawData={rawData}
            bracketState={bracketState}
          />
        )}
      </main>
    </div>
  );
}
