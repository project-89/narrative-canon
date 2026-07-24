#!/usr/bin/env node

/**
 * Timeline Warfare Launcher
 * 
 * Simple launcher for the Timeline Warfare game.
 * Uses the bundled version for best compatibility.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if bundled game exists
const bundledGame = path.join(__dirname, 'dist', 'timeline-warfare.js');

if (!fs.existsSync(bundledGame)) {
  console.log('⚠️  Game not built yet. Building now...');
  
  // Run the build
  const build = spawn('npm', ['run', 'build:bundle'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  build.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ Build complete! Starting game...\n');
      startGame();
    } else {
      console.error('❌ Build failed. Please run: npm run build:bundle');
      process.exit(1);
    }
  });
} else {
  startGame();
}

function startGame() {
  // Check for API key
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                    TIMELINE WARFARE                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    console.log('ℹ️  No Gemini API key detected.');
    console.log('   The game will use mock data for demonstrations.');
    console.log();
    console.log('   To enable AI features, set your API key:');
    console.log('   export GOOGLE_AI_API_KEY="your-key-here"');
    console.log();
    console.log('   Get a free key at: https://makersuite.google.com/app/apikey');
    console.log();
    console.log('Starting with mock data...\n');
    setTimeout(() => {
      runGame();
    }, 1000);
  } else {
    console.log('✅ Gemini API key detected. AI features enabled!');
    runGame();
  }
}

function runGame() {
  // Start the game
  const game = spawn('node', [bundledGame], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  game.on('close', (code) => {
    process.exit(code);
  });
}