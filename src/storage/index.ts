/**
 * Storage Adapter Factory
 *
 * The studio currently has one authoritative persistence backend: its local
 * file store. The legacy Mongo adapter does not preserve the complete studio
 * document and must not be selected by runtime configuration.
 */

import { StorageAdapter } from './storage-adapter';
import { FileStorageAdapter } from './file-adapter';
import { resolveNarrativeDataDir } from '../config/runtime-paths';

let storageInstance: StorageAdapter | null = null;

/**
 * Get the storage adapter instance (singleton pattern)
 *
 * DATA_DIR may relocate the complete file store. USE_MONGODB is deliberately
 * ignored and reset to false so older environments cannot make the server skip
 * its authoritative file writes.
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (process.env.USE_MONGODB === 'true') {
    console.error(
      'USE_MONGODB is disabled: the legacy Mongo adapter drops studio fields. ' +
      'Continuing with the complete file store.'
    );
    process.env.USE_MONGODB = 'false';
  }

  if (storageInstance) {
    return storageInstance;
  }

  const dataDir = resolveNarrativeDataDir();
  console.log(`Using file-based storage adapter at ${dataDir}`);
  storageInstance = new FileStorageAdapter(dataDir);

  return storageInstance;
}

/**
 * Close the storage adapter connection
 * Call this during graceful shutdown
 */
export async function closeStorage(): Promise<void> {
  if (storageInstance && storageInstance.close) {
    await storageInstance.close();
    storageInstance = null;
    console.log('Storage adapter closed');
  }
}

/**
 * Reset the storage instance (useful for testing)
 */
export function resetStorageInstance(): void {
  storageInstance = null;
}

// Re-export types and utilities from storage-adapter
export type {
  StorageAdapter,
  Project,
  ProjectStyleProfile,
  ProjectData,
  ProjectStats,
  ConversationHistory,
  ScratchpadDocument,
  ProjectProduction,
  ProjectArc,
  WorldEvent,
  SavedStyle,
  ProjectAct,
  ProjectTimeline,
  ProjectScript,
  Beat,
  ProductionDramaturgy,
} from './storage-adapter';

export {
  createEmptyProjectData,
  createDefaultProject,
} from './storage-adapter';

export { FileStorageAdapter } from './file-adapter';
export { MongoProjectAdapter } from './mongo-project-adapter';
