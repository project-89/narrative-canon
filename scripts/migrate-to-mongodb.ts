#!/usr/bin/env npx ts-node

/**
 * Migration Script: File Storage → MongoDB
 *
 * Migrates existing JSON file-based project data to MongoDB.
 * Run with: npm run migrate:mongodb
 *
 * Prerequisites:
 * - MongoDB running locally or connection string set in MONGODB_URI
 * - Existing data in .narrative-data/ directory
 */

import * as fs from 'fs';
import * as path from 'path';
import { MongoProjectAdapter } from '../src/storage/mongo-project-adapter';

const DATA_DIR = path.join(process.cwd(), '.narrative-data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

interface ProjectData {
  entities: any[];
  relationships: any[];
  commits: any[];
  branches: any[];
  interactions: any[];
  conversationHistory?: any;
}

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  stats: { entities: number; relationships: number; commits: number; branches: number };
  color: string;
}

async function migrate(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/narrative_canon';

  console.log('🚀 Starting migration to MongoDB...');
  console.log(`   Source: ${DATA_DIR}`);
  console.log(`   Target: ${mongoUri}`);
  console.log('');

  // Check if data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.log('❌ No .narrative-data directory found. Nothing to migrate.');
    process.exit(1);
  }

  // Connect to MongoDB
  console.log('📡 Connecting to MongoDB...');
  const mongoAdapter = new MongoProjectAdapter(mongoUri);
  await mongoAdapter.connect();

  const healthy = await mongoAdapter.isHealthy();
  if (!healthy) {
    console.error('❌ Failed to connect to MongoDB');
    process.exit(1);
  }
  console.log('✅ Connected to MongoDB');
  console.log('');

  // Load existing projects
  let projects: Project[] = [];
  if (fs.existsSync(PROJECTS_FILE)) {
    try {
      const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
      projects = JSON.parse(data);
      console.log(`📦 Found ${projects.length} project(s) to migrate`);
    } catch (err) {
      console.error('❌ Error reading projects.json:', err);
      process.exit(1);
    }
  } else {
    console.log('⚠️  No projects.json found');
  }

  // Migrate each project
  let migratedCount = 0;
  let errorCount = 0;

  for (const project of projects) {
    console.log(`\n📁 Migrating project: ${project.name} (${project.id})`);

    try {
      // Check if project already exists in MongoDB
      const existing = await mongoAdapter.getProject(project.id);
      if (existing) {
        console.log(`   ⏭️  Project already exists in MongoDB, updating...`);
        await mongoAdapter.updateProject(project.id, project);
      } else {
        // Create the project
        await mongoAdapter.createProject(project);
        console.log(`   ✅ Created project in MongoDB`);
      }

      // Load project data from file
      const projectDataFile = path.join(DATA_DIR, `project_${project.id}.json`);
      if (fs.existsSync(projectDataFile)) {
        try {
          const dataStr = fs.readFileSync(projectDataFile, 'utf-8');
          const projectData: ProjectData = JSON.parse(dataStr);

          // Save project data to MongoDB
          await mongoAdapter.saveProjectData(project.id, projectData);

          const stats = {
            entities: projectData.entities?.length || 0,
            relationships: projectData.relationships?.length || 0,
            commits: projectData.commits?.length || 0,
            branches: projectData.branches?.length || 0,
            interactions: projectData.interactions?.length || 0,
          };
          console.log(`   📊 Migrated data: ${stats.entities} entities, ${stats.relationships} relationships, ${stats.interactions} interactions`);
          migratedCount++;
        } catch (err) {
          console.error(`   ❌ Error reading project data:`, err);
          errorCount++;
        }
      } else {
        console.log(`   ⚠️  No project data file found`);
        migratedCount++;
      }

    } catch (err) {
      console.error(`   ❌ Error migrating project:`, err);
      errorCount++;
    }
  }

  // Handle project data files without corresponding project entries
  const orphanedFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('project_') && f.endsWith('.json'))
    .filter(f => !projects.some(p => f === `project_${p.id}.json`));

  if (orphanedFiles.length > 0) {
    console.log(`\n⚠️  Found ${orphanedFiles.length} orphaned project data file(s):`);
    for (const file of orphanedFiles) {
      console.log(`   - ${file}`);
    }
    console.log('   These files have no corresponding project entry and were not migrated.');
  }

  // Close connection
  await mongoAdapter.close();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Total projects found: ${projects.length}`);
  console.log(`   Successfully migrated: ${migratedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('');

  if (errorCount === 0) {
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Set USE_MONGODB=true in your .env file');
    console.log('2. Set MONGODB_URI to your MongoDB connection string');
    console.log('3. Restart the API server');
    console.log('');
    console.log('Your original files in .narrative-data/ are preserved as backup.');
  } else {
    console.log('⚠️  Migration completed with errors. Please check the logs above.');
    process.exit(1);
  }
}

// Run migration
migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
