import React, { useState, useEffect, useCallback } from 'react';
import { buildBracket, applyPick } from './bracketLogic';
import BracketView from './components/BracketView';
import Leaderboard from './components/Leaderboard';
import styles from './App.module.css';

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [confirmedResults, setConfirmedResults] = useState(null);
  const [simulatedResults, setSimulatedResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('bracket');

  // Load bracket JSON
  useEffect(() => {
    fetch('/bracket.json')
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
    // Build a bracketState snapshot for invalidation logic
    const state = buildBracket(rawData, simulatedResults);
    const next = applyPick(simulatedResults, matchId, winnerId, rawData, state);
    setSimulatedResults(next);
  }, [rawData, simulatedResults]);

  const handleReset = useCallback(() => {
    if (confirmedResults) setSimulatedResults(JSON.parse(JSON.stringify(confirmedResults)));
  }, [confirmedResults]);

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

  const bracketState = buildBracket(rawData, simulatedResults);

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
          <BracketView
            rawData={rawData}
            bracketState={bracketState}
            simulatedResults={simulatedResults}
            confirmedResults={confirmedResults}
            onPick={handlePick}
          />
        ) : (
          <Leaderboard
            rawData={rawData}
            bracketState={bracketState}
            hasSimulation={hasSimulation}
          />
        )}
      </main>
    </div>
  );
}
