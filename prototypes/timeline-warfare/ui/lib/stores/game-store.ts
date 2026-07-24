/**
 * Timeline Warfare Game State Store
 */
import { create } from 'zustand';

export interface GameState {
  year: number;
  divergence: number;
  oneirocomPower: number;
  resistanceStrength: number;
  turn: number;
  status: 'active' | 'won' | 'lost' | 'paused' | 'loading';
  activeMission: Mission | null;
  cascadeEffects: CascadeEffect[];
  recentEvents: TimelineEvent[];
}

export interface Mission {
  id: string;
  title: string;
  narrative: string;
  approaches: Approach[];
  affectedEntities: string[];
  continuityReferences: string[];
}

export interface Approach {
  id: string;
  name: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  divergenceGain: number;
  successProbability: number;
}

export interface MissionResult {
  success: boolean;
  narrative: string;
  divergenceChange: number;
  newEntities: any[];
  newRelationships: any[];
  cascadeEffects: CascadeEffect[];
  gameState: GameState;
}

export interface CascadeEffect {
  sourceEventId: string;
  date: string;
  description: string;
  probability: number;
  magnitude: number;
  type: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  description: string;
  type: string;
  magnitude: number;
  entities: string[];
}

export interface OneirocomResponse {
  triggered: boolean;
  event?: TimelineEvent;
  divergenceLoss?: number;
  gameState?: GameState;
}

interface GameStore {
  // State
  gameState: GameState;
  missionResult: MissionResult | null;
  oneirocomResponse: OneirocomResponse | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchGameState: () => Promise<void>;
  startNewGame: () => Promise<void>;
  generateMission: () => Promise<void>;
  executeMission: (approachId: string) => Promise<void>;
  triggerOneirocomResponse: () => Promise<void>;
  clearMissionResult: () => void;
  clearOneirocomResponse: () => void;
}

const API_BASE = 'http://localhost:3088/api';

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: {
    year: 2089,
    divergence: 15,
    oneirocomPower: 85,
    resistanceStrength: 15,
    turn: 0,
    status: 'loading',
    activeMission: null,
    cascadeEffects: [],
    recentEvents: []
  },
  missionResult: null,
  oneirocomResponse: null,
  isLoading: false,
  error: null,

  fetchGameState: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/game/state`);
      if (!response.ok) throw new Error('Failed to fetch game state');
      const data = await response.json();
      set({ gameState: data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  startNewGame: async () => {
    set({ isLoading: true, error: null, missionResult: null, oneirocomResponse: null });
    try {
      const response = await fetch(`${API_BASE}/game/start`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to start game');
      const data = await response.json();
      set({ gameState: data.state, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  generateMission: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/game/mission/generate`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to generate mission');
      const mission = await response.json();
      set(state => ({
        gameState: { ...state.gameState, activeMission: mission },
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  executeMission: async (approachId: string) => {
    set({ isLoading: true, error: null, missionResult: null });
    try {
      const response = await fetch(`${API_BASE}/game/mission/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approachId })
      });
      if (!response.ok) throw new Error('Failed to execute mission');
      const result = await response.json();
      set({
        missionResult: result,
        gameState: result.gameState,
        isLoading: false
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  triggerOneirocomResponse: async () => {
    set({ isLoading: true, error: null, oneirocomResponse: null });
    try {
      const response = await fetch(`${API_BASE}/game/oneirocom/respond`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to get Oneirocom response');
      const result = await response.json();
      set({
        oneirocomResponse: result,
        gameState: result.triggered ? result.gameState : get().gameState,
        isLoading: false
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  clearMissionResult: () => set({ missionResult: null }),
  clearOneirocomResponse: () => set({ oneirocomResponse: null })
}));
