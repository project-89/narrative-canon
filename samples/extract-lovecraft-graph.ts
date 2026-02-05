#!/usr/bin/env ts-node

import { NarrativeGraphPipeline } from '../src/narrative-graph-pipeline';
import { UnifiedLLMAdapter } from '../src/llm/adapter';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function extractLovecraftAsGraph() {
  console.log('🦑 Lovecraft Narrative Graph Extraction\n');
  console.log('Extracting narrative as an evolving graph state machine...\n');
  
  try {
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    const useMock = !apiKey;
    
    if (useMock) {
      console.log('⚠️  Using mock LLM - results will be limited\n');
    } else {
      console.log('✅ Using Gemini API for rich extraction\n');
    }
    
    // Read the story
    const storyFile = path.join(__dirname, 'lovecraft-story.txt');
    const content = fs.readFileSync(storyFile, 'utf-8');
    
    console.log(`📖 Story loaded: ${content.length.toLocaleString()} characters`);
    console.log(`📜 "${content.split('\n')[0]}"\n`);
    
    // Create pipeline
    const adapter = new UnifiedLLMAdapter(apiKey, useMock);
    const pipeline = new NarrativeGraphPipeline(adapter);
    
    // Extract narrative graph
    const startTime = Date.now();
    const result = await pipeline.extractNarrativeGraph(content);
    const duration = Date.now() - startTime;
    
    console.log(`\n⏱️  Extraction completed in ${(duration / 1000).toFixed(1)}s`);
    
    // Display results
    console.log('\n📊 EXTRACTION RESULTS:');
    console.log('=' .repeat(50));
    
    console.log('\n🎭 Entities:');
    console.log(`Total: ${result.entities.length}`);
    const byType: Record<string, number> = {};
    result.entities.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    console.log('\n🎬 Scenes:');
    console.log(`Total: ${result.scenes.length}`);
    result.scenes.slice(0, 3).forEach(scene => {
      console.log(`\n${scene.sequence}. ${scene.summary}`);
      console.log(`   Location: ${scene.location || 'unspecified'}`);
      console.log(`   Characters: ${scene.characters.length} present`);
      console.log(`   Events: ${scene.events.length} events`);
    });
    
    console.log('\n🔄 Mutations:');
    console.log(`Total: ${result.mutations.length}`);
    const mutationTypes: Record<string, number> = {};
    result.mutations.forEach(m => {
      mutationTypes[m.type] = (mutationTypes[m.type] || 0) + 1;
    });
    console.log('\nMutation type distribution:');
    Object.entries(mutationTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    console.log('\n📈 Narrative Analysis:');
    console.log(`Total commits: ${result.analysis.totalCommits}`);
    console.log(`Critical moments: ${result.analysis.criticalMoments.length}`);
    
    console.log('\nCritical moments in the narrative:');
    result.analysis.criticalMoments.forEach(moment => {
      console.log(`  - Timestamp ${moment.timestamp}: ${moment.message} (${moment.impact})`);
    });
    
    console.log('\n🌐 Graph Evolution:');
    const evolution = result.analysis.graphEvolution;
    console.log('Timeline of graph changes:');
    evolution.slice(0, 5).forEach((snapshot: any) => {
      console.log(`  T${snapshot.timestamp}: ${snapshot.entities} entities, ${snapshot.relationships} relationships`);
      console.log(`    ${snapshot.message}`);
      console.log(`    Changes: ${snapshot.mutationTypes.join(', ')}`);
    });
    
    console.log('\n💀 Entity Lifecycles:');
    const deaths = result.analysis.entityLifecycles
      .filter(([id, lifecycle]) => lifecycle.removed)
      .map(([id, lifecycle]) => {
        const entity = result.entities.find(e => e.id === id);
        return {
          name: entity?.name || id,
          lifespan: lifecycle.removed! - lifecycle.introduced,
          mutations: lifecycle.mutations
        };
      });
    
    if (deaths.length > 0) {
      console.log('Entities that were removed:');
      deaths.forEach(d => {
        console.log(`  - ${d.name}: lived for ${d.lifespan} timestamps, ${d.mutations} changes`);
      });
    }
    
    // Save outputs
    const outputDir = path.join(__dirname, 'lovecraft-graph-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save complete extraction
    fs.writeFileSync(
      path.join(outputDir, 'narrative-graph.json'),
      JSON.stringify(result, null, 2)
    );
    
    // Save complete narrative database
    const completeData = pipeline.saveCompleteNarrativeData();
    fs.writeFileSync(
      path.join(outputDir, 'complete-narrative-data.json'),
      JSON.stringify(completeData, null, 2)
    );
    
    // Save visualization data
    const vizData = pipeline.generateVisualizationData();
    fs.writeFileSync(
      path.join(outputDir, 'visualization-data.json'),
      JSON.stringify(vizData, null, 2)
    );
    
    // Generate state machine export for git-like operations
    fs.writeFileSync(
      path.join(outputDir, 'state-machine.json'),
      JSON.stringify(result.stateMachine, null, 2)
    );
    
    // Create a narrative diff example
    if (result.stateMachine.commits.length > 2) {
      const firstCommit = result.stateMachine.commits[0][1];
      const lastCommit = result.stateMachine.commits[result.stateMachine.commits.length - 1][1];
      
      console.log('\n🔍 Narrative Diff (First → Last):');
      console.log(`From: ${firstCommit.message}`);
      console.log(`To: ${lastCommit.message}`);
      console.log(`Total changes: ${result.mutations.length} mutations`);
    }
    
    // Generate HTML visualization
    const html = generateGraphVisualizationHTML(vizData, {
      title: 'The Colour Out of Space - Narrative Graph',
      duration: duration,
      method: 'state-machine'
    });
    
    const htmlPath = path.join(outputDir, 'graph-visualization.html');
    fs.writeFileSync(htmlPath, html);
    
    // Generate enhanced explorer
    const { saveEnhancedExplorer } = await import('../src/visualization/enhanced-narrative-explorer');
    
    // Extract title from the first line of content
    const title = content.split('\n')[0].trim() || 'The Colour Out of Space';
    
    const enhancedData = {
      entities: completeData.entities,
      relationships: completeData.relationships,
      scenes: completeData.scenes,
      mutations: completeData.mutations,
      commits: completeData.commits.map(([id, commit]) => commit), // Extract just the commit objects
      snapshots: completeData.snapshots,
      metadata: {
        title: title,
        extractionDate: new Date().toISOString(),
        totalEntities: completeData.entities.length,
        totalRelationships: completeData.relationships.length,
        totalScenes: completeData.scenes.length,
        totalMutations: completeData.mutations.length,
        totalCommits: completeData.commits.length
      }
    };
    saveEnhancedExplorer(enhancedData, path.join(outputDir, 'narrative-explorer.html'));
    
    console.log('\n💾 Files saved:');
    console.log(`  📁 ${outputDir}/`);
    console.log(`     📄 narrative-graph.json (complete extraction)`);
    console.log(`     📄 complete-narrative-data.json (full database)`);
    console.log(`     📄 visualization-data.json (for rendering)`);
    console.log(`     📄 state-machine.json (git-like history)`);
    console.log(`     🌐 graph-visualization.html (interactive viz)`);
    console.log(`     🎯 narrative-explorer.html (enhanced UI)`);
    
    console.log('\n📊 Complete Data Summary:');
    console.log(`  Entities: ${completeData.entities.length}`);
    console.log(`  Relationships: ${completeData.relationships.length}`);
    console.log(`  Scenes: ${completeData.scenes.length}`);
    console.log(`  Mutations: ${completeData.mutations.length}`);
    console.log(`  Commits: ${completeData.commits.length}`);
    console.log(`  Snapshots: ${completeData.snapshots.length}`);
    
    console.log('\n🎯 Next steps:');
    console.log('1. Open graph-visualization.html to see the narrative evolution');
    console.log('2. Use state-machine.json to implement branching narratives');
    console.log('3. Build consistency checks based on the mutation history');
    
    // Open visualization
    const { exec } = require('child_process');
    exec(`open "${htmlPath}"`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }
}

function generateGraphVisualizationHTML(data: any, metadata: any): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vis-network@latest/dist/vis-network.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/vis-network@latest/dist/dist/vis-network.min.css" rel="stylesheet" type="text/css" />
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #0a0a0a;
            color: #e0e0e0;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            padding: 30px 0;
            border-bottom: 1px solid #333;
            margin-bottom: 30px;
        }
        
        h1 {
            margin: 0;
            font-size: 2.5rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }
        
        .stat-label {
            font-size: 0.9rem;
            color: #999;
        }
        
        .visualization-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .viz-panel {
            background: #1a1a1a;
            border-radius: 12px;
            padding: 20px;
            min-height: 500px;
        }
        
        .viz-panel h2 {
            margin-top: 0;
            color: #667eea;
        }
        
        #network-graph, #timeline-graph {
            height: 450px;
            background: #0a0a0a;
            border-radius: 8px;
        }
        
        .timeline-controls {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-top: 20px;
            padding: 15px;
            background: #0a0a0a;
            border-radius: 8px;
        }
        
        #timeline-slider {
            flex: 1;
            height: 30px;
        }
        
        .mutations-log {
            background: #1a1a1a;
            border-radius: 12px;
            padding: 20px;
            max-height: 600px;
            overflow-y: auto;
        }
        
        .mutation-item {
            padding: 10px;
            margin-bottom: 10px;
            background: #0a0a0a;
            border-radius: 6px;
            border-left: 3px solid #667eea;
        }
        
        .mutation-type {
            font-weight: bold;
            color: #764ba2;
        }
        
        .critical-moment {
            background: #2a1a3a;
            border-left-color: #ff6b6b;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${metadata.title}</h1>
            <p>Narrative extracted as evolving graph in ${(metadata.duration / 1000).toFixed(1)}s</p>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${data.commits.length}</div>
                    <div class="stat-label">Commits</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${data.mutations.length}</div>
                    <div class="stat-label">Mutations</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${data.currentGraph.entities.length}</div>
                    <div class="stat-label">Final Entities</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${data.currentGraph.relationships.length}</div>
                    <div class="stat-label">Final Relationships</div>
                </div>
            </div>
        </div>
        
        <div class="visualization-container">
            <div class="viz-panel">
                <h2>Current Graph State</h2>
                <div id="network-graph"></div>
            </div>
            
            <div class="viz-panel">
                <h2>Graph Evolution Timeline</h2>
                <div id="timeline-graph"></div>
                <div class="timeline-controls">
                    <button id="play-btn">▶️ Play</button>
                    <input type="range" id="timeline-slider" min="0" max="${data.snapshots.length - 1}" value="0">
                    <span id="timeline-label">T0</span>
                </div>
            </div>
        </div>
        
        <div class="mutations-log">
            <h2>Mutation History</h2>
            <div id="mutations-list">
                ${data.mutations.slice(0, 20).map((m: any) => `
                    <div class="mutation-item ${m.impact === 'major' || m.impact === 'transformative' ? 'critical-moment' : ''}">
                        <div class="mutation-type">${m.type}</div>
                        <div>${m.description}</div>
                        <small>Commit: ${m.commitMessage} | Impact: ${m.impact}</small>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
    
    <script>
        const data = ${JSON.stringify(data)};
        
        // Initialize network graph
        const container = document.getElementById('network-graph');
        const nodes = new vis.DataSet(
            data.currentGraph.entities.map(e => ({
                id: e.id,
                label: e.name,
                group: e.type,
                title: e.description
            }))
        );
        
        const edges = new vis.DataSet(
            data.currentGraph.relationships.map(r => ({
                from: r.source,
                to: r.target,
                label: r.type,
                arrows: 'to'
            }))
        );
        
        const network = new vis.Network(container, {
            nodes: nodes,
            edges: edges
        }, {
            groups: {
                character: { color: '#667eea' },
                object: { color: '#ff6b6b' },
                location: { color: '#4ecdc4' },
                concept: { color: '#f7b731' },
                force: { color: '#e056fd' }
            },
            physics: {
                stabilization: false,
                barnesHut: {
                    gravitationalConstant: -8000,
                    springConstant: 0.04
                }
            }
        });
        
        // Timeline functionality
        const slider = document.getElementById('timeline-slider');
        const label = document.getElementById('timeline-label');
        const playBtn = document.getElementById('play-btn');
        let playing = false;
        let playInterval;
        
        function updateGraphToSnapshot(index) {
            const snapshot = data.snapshots[index];
            label.textContent = 'T' + snapshot.timestamp;
            
            // Update network with snapshot data
            // This would animate the graph changes
        }
        
        slider.addEventListener('input', (e) => {
            updateGraphToSnapshot(parseInt(e.target.value));
        });
        
        playBtn.addEventListener('click', () => {
            playing = !playing;
            playBtn.textContent = playing ? '⏸️ Pause' : '▶️ Play';
            
            if (playing) {
                playInterval = setInterval(() => {
                    let val = parseInt(slider.value);
                    if (val < data.snapshots.length - 1) {
                        slider.value = val + 1;
                        updateGraphToSnapshot(val + 1);
                    } else {
                        playing = false;
                        playBtn.textContent = '▶️ Play';
                        clearInterval(playInterval);
                    }
                }, 1000);
            } else {
                clearInterval(playInterval);
            }
        });
        
        // Initialize timeline graph
        const timelineContainer = document.getElementById('timeline-graph');
        const margin = {top: 20, right: 20, bottom: 30, left: 50};
        const width = timelineContainer.clientWidth - margin.left - margin.right;
        const height = 450 - margin.top - margin.bottom;
        
        const svg = d3.select('#timeline-graph')
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        
        // Scales
        const x = d3.scaleLinear()
            .domain([0, data.snapshots.length - 1])
            .range([0, width]);
            
        const y = d3.scaleLinear()
            .domain([0, d3.max(data.snapshots, d => d.entityCount + d.relationshipCount)])
            .range([height, 0]);
        
        // Lines
        const entityLine = d3.line()
            .x((d, i) => x(i))
            .y(d => y(d.entityCount));
            
        const relationshipLine = d3.line()
            .x((d, i) => x(i))
            .y(d => y(d.relationshipCount));
        
        // Add lines
        svg.append('path')
            .datum(data.snapshots)
            .attr('fill', 'none')
            .attr('stroke', '#667eea')
            .attr('stroke-width', 2)
            .attr('d', entityLine);
            
        svg.append('path')
            .datum(data.snapshots)
            .attr('fill', 'none')
            .attr('stroke', '#764ba2')
            .attr('stroke-width', 2)
            .attr('d', relationshipLine);
        
        // Add axes
        svg.append('g')
            .attr('transform', 'translate(0,' + height + ')')
            .call(d3.axisBottom(x));
            
        svg.append('g')
            .call(d3.axisLeft(y));
    </script>
</body>
</html>`;
}

// Run the extraction
extractLovecraftAsGraph();