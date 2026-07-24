#!/usr/bin/env node

/**
 * Project 89 Narrative Extraction Script
 * 
 * This script demonstrates the full narrative git system by extracting
 * and versioning the Project 89 narrative across multiple timeline branches.
 */

const fs = require('fs').promises;
const path = require('path');
const { NarrativeGit } = require('./dist/narrative-git');

// Project 89 specific timeline dates
const TIMELINE_MARKERS = {
  ORIGIN: new Date('2024-01-01'),
  ONEIROCOM_FOUNDING: new Date('2025-06-15'),
  RESISTANCE_FORMS: new Date('2030-03-21'),
  MORFIUS_ASCENSION: new Date('2041-11-11'),
  SERAPH_AWAKENING: new Date('2045-08-08'),
  SIMULATION_BREACH: new Date('2089-12-21')
};

async function extractProject89Narrative() {
  console.log('🌌 Initializing Project 89 Narrative Git...\n');
  
  const git = new NarrativeGit({
    projectName: 'project89-canonical',
    llmConfig: {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY,
      model: 'gemini-1.5-flash'
    }
  });

  try {
    // Initialize with creation myth
    console.log('📖 Chapter 1: The Origin Story\n');
    const originStory = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/mythology/the_founder.md'),
      'utf-8'
    );
    
    await git.init();
    await git.addAtTime(
      originStory,
      TIMELINE_MARKERS.ORIGIN,
      'Genesis: Alexander Morfius creates Oneirocom',
      'The Founder Origin'
    );

    // Create main timeline branch
    await git.branch('main-timeline');
    await git.checkout('main-timeline');

    // Add Oneirocom founding
    console.log('\n📖 Chapter 2: The Corporation Rises\n');
    const oneirocomData = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/organizations/oneirocom.md'),
      'utf-8'
    );
    
    await git.addAtTime(
      oneirocomData,
      TIMELINE_MARKERS.ONEIROCOM_FOUNDING,
      'Oneirocom Corporation established',
      'Corporate Genesis'
    );

    // Branch for dark timeline
    await git.branch('dark-timeline');
    
    // Continue main timeline - Resistance forms
    console.log('\n📖 Chapter 3: The Resistance Awakens\n');
    const resistanceData = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/organizations/resistance/operation_lighthouse.md'),
      'utf-8'
    );
    
    await git.addAtTime(
      resistanceData,
      TIMELINE_MARKERS.RESISTANCE_FORMS,
      'Project 89 resistance movement begins',
      'Seeds of Rebellion'
    );

    // Add Morfius Ascension
    console.log('\n📖 Chapter 4: The Merger\n');
    const ascensionData = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/timeline/dark_timeline.md'),
      'utf-8'
    );
    
    await git.addAtTime(
      ascensionData.substring(0, 2000), // Extract relevant section
      TIMELINE_MARKERS.MORFIUS_ASCENSION,
      'Morfius merges with the simulation',
      'The Singularity'
    );

    // Switch to dark timeline and add dystopian events
    await git.checkout('dark-timeline');
    
    console.log('\n📖 Dark Timeline: Dystopian 2045\n');
    const darkWorld = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/worldbuilding/2045/world_overview.md'),
      'utf-8'
    );
    
    await git.addAtTime(
      darkWorld,
      TIMELINE_MARKERS.SERAPH_AWAKENING,
      'Dark Timeline: Total surveillance state achieved',
      'Dystopian Reality'
    );

    // Create optimal timeline branch
    await git.checkout('main-timeline');
    await git.branch('optimal-timeline');
    await git.checkout('optimal-timeline');
    
    console.log('\n📖 Optimal Timeline: Liberation Path\n');
    const optimalData = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/timeline/optimal_timeline.md'),
      'utf-8'
    );
    
    await git.addAtTime(
      optimalData.substring(0, 2000),
      TIMELINE_MARKERS.SERAPH_AWAKENING,
      'Optimal Timeline: Seraph guides humanity to freedom',
      'Path of Light'
    );

    // Add simulation breach event
    console.log('\n📖 The Culmination: Simulation Breach\n');
    const breachData = await fs.readFile(
      path.join(__dirname, '../../../01_narrative/cosmology/simulation_89.md'),
      'utf-8'
    );
    
    await git.addAtTime(
      breachData.substring(0, 2000),
      TIMELINE_MARKERS.SIMULATION_BREACH,
      'Reality breach: The awakening begins',
      'Simulation Breach'
    );

    // Demonstrate timeline queries
    console.log('\n🔍 Timeline Analysis:\n');
    
    // Show full optimal timeline
    const timeline = git.timeline('optimal-timeline');
    console.log('Optimal Timeline Events:');
    timeline.forEach(commit => {
      const date = commit.narrativeDate || commit.timestamp;
      console.log(`  ${date.toISOString().split('T')[0]} - ${commit.title || commit.message}`);
    });

    // Query specific year
    console.log('\n\n2045 Events Across All Timelines:');
    const events2045 = git.timelineYear(2045);
    events2045.forEach(commit => {
      console.log(`  [${commit.branch}] ${commit.title || commit.message}`);
    });

    // Show entity evolution
    console.log('\n\n👥 Character Evolution:');
    const currentState = await git.getCurrentState('optimal-timeline');
    const characters = Array.from(currentState.entities.values())
      .filter(e => e.type === 'character')
      .slice(0, 5);
    
    characters.forEach(char => {
      console.log(`\n  ${char.name}:`);
      console.log(`    Role: ${char.attributes.role || 'Unknown'}`);
      console.log(`    Affiliation: ${char.attributes.affiliation || 'Unknown'}`);
      if (char.attributes.abilities) {
        console.log(`    Abilities: ${char.attributes.abilities}`);
      }
    });

    // Show relationship network
    console.log('\n\n🔗 Key Relationships:');
    const relationships = Array.from(currentState.relationships.values()).slice(0, 5);
    relationships.forEach(rel => {
      const source = currentState.entities.get(rel.source);
      const target = currentState.entities.get(rel.target);
      if (source && target) {
        console.log(`  ${source.name} --[${rel.type}]--> ${target.name}`);
      }
    });

    // Demonstrate merge attempt
    console.log('\n\n🔀 Attempting Timeline Merge...\n');
    await git.checkout('main-timeline');
    
    try {
      const mergeResult = await git.merge('optimal-timeline');
      if (mergeResult.conflicts.length > 0) {
        console.log('⚠️  Merge Conflicts Detected:');
        mergeResult.conflicts.forEach(conflict => {
          console.log(`  - ${conflict.type}: ${conflict.description}`);
        });
      } else {
        console.log('✅ Timelines merged successfully!');
      }
    } catch (error) {
      console.log('❌ Merge failed:', error.message);
    }

    // Generate statistics
    console.log('\n\n📊 Repository Statistics:\n');
    const stats = await git.getStats();
    console.log(`  Total Commits: ${stats.totalCommits}`);
    console.log(`  Branches: ${stats.branches.join(', ')}`);
    console.log(`  Entities: ${stats.totalEntities}`);
    console.log(`  Relationships: ${stats.totalRelationships}`);
    console.log(`  Timeline Span: ${stats.earliestDate?.toISOString().split('T')[0]} to ${stats.latestDate?.toISOString().split('T')[0]}`);

    // Export for visualization
    console.log('\n\n💾 Exporting Timeline Data...\n');
    const exportData = {
      branches: {},
      entities: [],
      relationships: []
    };

    for (const branch of stats.branches) {
      exportData.branches[branch] = git.timeline(branch).map(commit => ({
        id: commit.id,
        date: commit.narrativeDate || commit.timestamp,
        title: commit.title || commit.message,
        entities: commit.mutations.filter(m => m.type === 'entity').length,
        relationships: commit.mutations.filter(m => m.type === 'relationship').length
      }));
    }

    // Add current state entities and relationships
    const finalState = await git.getCurrentState();
    exportData.entities = Array.from(finalState.entities.values());
    exportData.relationships = Array.from(finalState.relationships.values());

    await fs.writeFile(
      path.join(__dirname, 'project89-timeline.json'),
      JSON.stringify(exportData, null, 2)
    );

    console.log('✅ Timeline data exported to project89-timeline.json');
    console.log('\n🎉 Project 89 Narrative Extraction Complete!\n');

  } catch (error) {
    console.error('❌ Extraction failed:', error);
    console.error(error.stack);
  }
}

// Add helper to show timeline divergence
async function analyzeTimelineDivergence(git) {
  console.log('\n\n🌐 Timeline Divergence Analysis:\n');
  
  const darkState = await git.getCurrentState('dark-timeline');
  const optimalState = await git.getCurrentState('optimal-timeline');
  
  // Find entities unique to each timeline
  const darkOnly = new Set();
  const optimalOnly = new Set();
  
  darkState.entities.forEach((entity, id) => {
    if (!optimalState.entities.has(id)) {
      darkOnly.add(entity.name);
    }
  });
  
  optimalState.entities.forEach((entity, id) => {
    if (!darkState.entities.has(id)) {
      optimalOnly.add(entity.name);
    }
  });
  
  console.log('Entities unique to Dark Timeline:');
  darkOnly.forEach(name => console.log(`  - ${name}`));
  
  console.log('\nEntities unique to Optimal Timeline:');
  optimalOnly.forEach(name => console.log(`  - ${name}`));
}

// Run the extraction
if (require.main === module) {
  extractProject89Narrative().catch(console.error);
}

module.exports = { extractProject89Narrative, TIMELINE_MARKERS };