"use client";

import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Trophy,
  Skull,
  Sparkles,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/lib/stores/game-store";
import {
  DivergenceMeter,
  WorldStatus,
  MissionCard,
  MissionResult,
  OneirocomAlert,
  CascadeTimeline
} from "@/components/game";

export default function PlayPage() {
  const {
    gameState,
    missionResult,
    oneirocomResponse,
    isLoading,
    error,
    fetchGameState,
    startNewGame,
    generateMission,
    executeMission,
    triggerOneirocomResponse,
    clearMissionResult,
    clearOneirocomResponse
  } = useGameStore();

  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  // Handle mission execution and Oneirocom response
  const handleExecuteMission = async (approachId: string) => {
    await executeMission(approachId);
    // After mission, check for Oneirocom counter
    setTimeout(() => {
      triggerOneirocomResponse();
    }, 2000);
  };

  // Handle continuing after mission result
  const handleContinue = async () => {
    clearMissionResult();
    clearOneirocomResponse();
    // Generate new mission
    await generateMission();
  };

  // Handle start/restart game
  const handleStartGame = async () => {
    setShowIntro(false);
    await startNewGame();
    await generateMission();
  };

  // Show intro screen
  if (showIntro && gameState.status === 'loading') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto px-4">
          <div className="inline-block rounded-2xl border border-primary/30 bg-primary/5 p-8 mb-8">
            <Sparkles className="h-16 w-16 mx-auto text-primary animate-pulse" />
          </div>

          <h1 className="text-4xl font-bold text-foreground mb-4">
            Timeline Warfare
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            The year is 2089. Oneirocom controls reality through the Convergence Protocol.
            You are Agent Chen, fighting to liberate the timeline.
          </p>

          <button
            onClick={handleStartGame}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Play className="h-5 w-5" />
            Begin Mission
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading && !gameState.activeMission && !missionResult) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
          <p className="mt-4 text-muted-foreground">Initializing timeline...</p>
        </div>
      </div>
    );
  }

  // Show win screen
  if (gameState.status === 'won') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto px-4">
          <div className="inline-block rounded-2xl border border-green-500/30 bg-green-500/10 p-8 mb-8">
            <Trophy className="h-16 w-16 mx-auto text-green-500" />
          </div>

          <h1 className="text-4xl font-bold text-green-400 mb-4">
            Timeline Liberation!
          </h1>
          <p className="text-xl text-muted-foreground mb-4">
            Divergence has reached {gameState.divergence}%.
          </p>
          <p className="text-muted-foreground mb-8">
            The Convergence Protocol is failing. Across Neo-Tokyo and beyond,
            collapsed timelines are reasserting themselves. Reality is free.
          </p>

          <div className="flex justify-center gap-4">
            <button
              onClick={handleStartGame}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-5 w-5" />
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show lose screen
  if (gameState.status === 'lost') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto px-4">
          <div className="inline-block rounded-2xl border border-red-500/30 bg-red-500/10 p-8 mb-8">
            <Skull className="h-16 w-16 mx-auto text-red-500" />
          </div>

          <h1 className="text-4xl font-bold text-red-400 mb-4">
            Timeline Collapsed
          </h1>
          <p className="text-xl text-muted-foreground mb-4">
            Divergence fell to {gameState.divergence}%.
          </p>
          <p className="text-muted-foreground mb-8">
            Oneirocom's Convergence Protocol has succeeded. This branch of reality
            has been pruned. But somewhere, in another timeline, the fight continues...
          </p>

          <div className="flex justify-center gap-4">
            <button
              onClick={handleStartGame}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-5 w-5" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show mission result
  if (missionResult) {
    return (
      <div className="space-y-6">
        <WorldStatus
          year={gameState.year}
          turn={gameState.turn}
          oneirocomPower={gameState.oneirocomPower}
          resistanceStrength={gameState.resistanceStrength}
        />

        <DivergenceMeter current={gameState.divergence} />

        <MissionResult
          result={missionResult}
          onContinue={handleContinue}
        />

        {oneirocomResponse && (
          <OneirocomAlert
            response={oneirocomResponse}
            onDismiss={clearOneirocomResponse}
          />
        )}
      </div>
    );
  }

  // Main game view
  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timeline Warfare</h1>
          <p className="text-muted-foreground">Turn {gameState.turn} | Year {gameState.year}</p>
        </div>
        <button
          onClick={handleStartGame}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Restart
        </button>
      </div>

      {/* Divergence meter */}
      <div className="rounded-xl border border-border bg-card p-6">
        <DivergenceMeter current={gameState.divergence} />
      </div>

      {/* World status */}
      <WorldStatus
        year={gameState.year}
        turn={gameState.turn}
        oneirocomPower={gameState.oneirocomPower}
        resistanceStrength={gameState.resistanceStrength}
      />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Mission area - 2 columns */}
        <div className="lg:col-span-2">
          {gameState.activeMission ? (
            <MissionCard
              mission={gameState.activeMission}
              onExecute={handleExecuteMission}
              isExecuting={isLoading}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <h3 className="mt-4 font-semibold text-foreground">No Active Mission</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Generate a new mission to continue the fight.
              </p>
              <button
                onClick={generateMission}
                disabled={isLoading}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4" />
                    Generate Mission
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Cascade effects - 1 column */}
        <div>
          <CascadeTimeline cascades={gameState.cascadeEffects} />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Oneirocom alert modal */}
      {oneirocomResponse && (
        <OneirocomAlert
          response={oneirocomResponse}
          onDismiss={clearOneirocomResponse}
        />
      )}
    </div>
  );
}
