/**
 * Storage Adapter Factory
 *
 * Returns the appropriate storage adapter based on environment configuration.
 * Supports MongoDB (recommended for production) and file-based (for development).
 */

import { StorageAdapter } from './storage-adapter';
import { FileStorageAdapter } from './file-adapter';
import { MongoProjectAdapter } from './mongo-project-adapter';

let storageInstance: StorageAdapter | null = null;

/**
 * Get the storage adapter instance (singleton pattern)
 *
 * Environment variables:
 * - USE_MONGODB: Set to 'true' to use MongoDB storage
 * - MONGODB_URI: MongoDB connection string (required if USE_MONGODB is true)
 * - DATA_DIR: Optional custom directory for file-based storage
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (storageInstance) {
    return storageInstance;
  }

  const useMongoDB = process.env.USE_MONGODB === 'true';

  if (useMongoDB) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.warn('USE_MONGODB is true but MONGODB_URI is not set. Falling back to file storage.');
      storageInstance = new FileStorageAdapter(process.env.DATA_DIR);
    } else {
      try {
        console.log('Initializing MongoDB storage adapter...');
        const mongoAdapter = new MongoProjectAdapter(mongoUri);
        await mongoAdapter.waitForConnection();

        // Verify connection is healthy
        const healthy = await mongoAdapter.isHealthy();
        if (!healthy) {
          throw new Error('MongoDB connection is not healthy');
        }

        console.log('MongoDB storage adapter initialized successfully');
        storageInstance = mongoAdapter;
      } catch (error) {
        console.error('Failed to initialize MongoDB storage:', error);
        console.warn('Falling back to file-based storage');
        storageInstance = new FileStorageAdapter(process.env.DATA_DIR);
      }
    }
  } else {
    console.log('Using file-based storage adapter');
    storageInstance = new FileStorageAdapter(process.env.DATA_DIR);
  }

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
