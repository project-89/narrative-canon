#!/usr/bin/env node

/**
 * Test script to verify timeline warfare game works
 */

const { spawn } = require('child_process');
const path = require('path');

async function testTimelineWarfare() {
  console.log('🧪 Testing Timeline Warfare game...');
  
  const gameProcess = spawn('node', [
    path.join(__dirname, 'examples/games/timeline-warfare-simple.js')
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let output = '';
  
  gameProcess.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  gameProcess.stderr.on('data', (data) => {
    console.error('Game error:', data.toString());
  });
  
  // Send initial enter to continue
  setTimeout(() => {
    gameProcess.stdin.write('\n');
  }, 100);
  
  // Send action choice (launch mission)
  setTimeout(() => {
    gameProcess.stdin.write('1\n');
  }, 200);
  
  // Send mission choice
  setTimeout(() => {
    gameProcess.stdin.write('1\n');
  }, 300);
  
  // Exit after getting some output
  setTimeout(() => {
    gameProcess.stdin.write('4\n');
    gameProcess.kill();
  }, 500);
  
  return new Promise((resolve) => {
    gameProcess.on('close', (code) => {
      console.log('✅ Timeline Warfare game test completed');
      console.log('📊 Game output preview:', output.substring(0, 200) + '...');
      
      if (output.includes('TIMELINE WARFARE') && output.includes('Turn')) {
        console.log('✅ Game displays correctly');
        resolve(true);
      } else {
        console.log('❌ Game output missing expected content');
        console.log('Full output length:', output.length);
        console.log('Checking for keywords...');
        console.log('Has TIMELINE WARFARE:', output.includes('TIMELINE WARFARE'));
        console.log('Has Turn:', output.includes('Turn'));
        console.log('Has Divergence:', output.includes('Divergence'));
        resolve(false);
      }
    });
  });
}

// Run test
testTimelineWarfare().then(success => {
  process.exit(success ? 0 : 1);
});