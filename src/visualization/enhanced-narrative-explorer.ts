import * as fs from "fs";
import * as path from "path";
import { Entity, Relationship, Scene } from "../types";
import { GraphMutation, NarrativeCommit } from "../narrative-state-machine";

export interface EnhancedVisualizationData {
  entities: Entity[];
  relationships: Relationship[];
  scenes: Scene[];
  mutations: GraphMutation[];
  commits: NarrativeCommit[];
  snapshots: any[]; // Using any for now since the actual format differs
  metadata: {
    title: string;
    extractionDate: string;
    totalEntities: number;
    totalRelationships: number;
    totalScenes: number;
    totalMutations: number;
    totalCommits: number;
  };
}

export function generateEnhancedExplorerHTML(
  data: EnhancedVisualizationData
): string {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${data.metadata.title} - Narrative Explorer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.6/dist/vis-network.min.js"></script>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.6/dist/vis-network.min.css">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0e27;
            color: #e0e0e0;
            height: 100vh;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            height: 100vh;
        }
        
        /* Left panel - Scenes list */
        .scenes-panel {
            width: 300px;
            background: #111827;
            border-right: 1px solid #1f2937;
            overflow-y: auto;
            padding: 20px;
        }
        
        .scene-item {
            background: #1f2937;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .scene-item:hover {
            background: #374151;
            transform: translateX(5px);
        }
        
        .scene-item.active {
            background: #3730a3;
            border-color: #4c1d95;
        }
        
        .scene-title {
            font-weight: 600;
            margin-bottom: 5px;
            color: #f3f4f6;
        }
        
        .scene-meta {
            font-size: 0.85em;
            color: #9ca3af;
        }
        
        /* Main view */
        .main-view {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: #111827;
            padding: 20px;
            border-bottom: 1px solid #1f2937;
        }
        
        .tabs {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        
        .tab {
            padding: 10px 20px;
            background: #1f2937;
            border: 1px solid #374151;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .tab:hover {
            background: #374151;
        }
        
        .tab.active {
            background: #3730a3;
            border-color: #4c1d95;
        }
        
        .content-area {
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        
        .view-content {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: none;
        }
        
        .view-content.active {
            display: block;
        }
        
        #networkView {
            width: 100%;
            height: 100%;
            background: #0a0e27;
        }
        
        /* Entity drawer */
        .entity-drawer {
            position: absolute;
            right: -400px;
            top: 0;
            width: 400px;
            height: 100%;
            background: #111827;
            border-left: 1px solid #1f2937;
            padding: 30px;
            overflow-y: auto;
            transition: right 0.3s ease;
            z-index: 100;
        }
        
        .entity-drawer.open {
            right: 0;
        }
        
        .drawer-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: none;
            border: none;
            color: #9ca3af;
            font-size: 24px;
            cursor: pointer;
        }
        
        .entity-name {
            font-size: 1.5em;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .entity-type {
            display: inline-block;
            padding: 4px 12px;
            background: #374151;
            border-radius: 20px;
            font-size: 0.85em;
            margin-bottom: 20px;
        }
        
        .entity-description {
            margin-bottom: 30px;
            line-height: 1.6;
        }
        
        .relationships-section {
            margin-bottom: 30px;
        }
        
        .section-title {
            font-weight: 600;
            margin-bottom: 15px;
            color: #f3f4f6;
        }
        
        .relationship-item {
            background: #1f2937;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 10px;
        }
        
        .relationship-type {
            font-size: 0.85em;
            color: #60a5fa;
            margin-bottom: 5px;
        }
        
        /* Timeline controls */
        .timeline-controls {
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: #111827;
            border: 1px solid #1f2937;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 20px;
            z-index: 50;
        }
        
        .play-button {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #3730a3;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .timeline-slider {
            width: 300px;
            height: 6px;
            background: #374151;
            border-radius: 3px;
            position: relative;
            cursor: pointer;
        }
        
        .timeline-progress {
            height: 100%;
            background: #3730a3;
            border-radius: 3px;
            width: 0%;
            transition: width 0.3s ease;
        }
        
        .timeline-info {
            font-size: 0.9em;
            color: #9ca3af;
        }
        
        /* Scene view */
        .scene-detail {
            padding: 30px;
            max-width: 800px;
            margin: 0 auto;
        }
        
        .scene-header {
            margin-bottom: 30px;
        }
        
        .scene-content {
            background: #1f2937;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
        }
        
        .entities-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .entity-card {
            background: #111827;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .entity-card:hover {
            background: #374151;
            transform: translateY(-2px);
        }
        
        /* Stats view */
        .stats-container {
            padding: 30px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
        }
        
        .stat-card {
            background: #1f2937;
            border-radius: 12px;
            padding: 30px;
        }
        
        .stat-value {
            font-size: 3em;
            font-weight: 600;
            color: #3730a3;
            margin-bottom: 10px;
        }
        
        .stat-label {
            color: #9ca3af;
        }
        
        /* Loading */
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 1.2em;
            color: #9ca3af;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Scenes Panel -->
        <div class="scenes-panel">
            <h2 style="margin-bottom: 20px; color: #f3f4f6;">Scenes</h2>
            <div id="scenesList"></div>
        </div>
        
        <!-- Main View -->
        <div class="main-view">
            <div class="header">
                <h1>${data.metadata.title}</h1>
                <div class="tabs">
                    <div class="tab active" data-view="network">Network</div>
                    <div class="tab" data-view="timeline">Timeline</div>
                    <div class="tab" data-view="scene">Scene Detail</div>
                    <div class="tab" data-view="stats">Statistics</div>
                </div>
            </div>
            
            <div class="content-area">
                <!-- Network View -->
                <div id="networkView" class="view-content active">
                    <div class="loading">Building network visualization...</div>
                </div>
                
                <!-- Timeline View -->
                <div id="timelineView" class="view-content">
                    <svg id="timelineSvg" width="100%" height="100%"></svg>
                </div>
                
                <!-- Scene Detail View -->
                <div id="sceneView" class="view-content">
                    <div class="scene-detail">
                        <div class="scene-header">
                            <h2 id="sceneDetailTitle">Select a scene</h2>
                            <div class="scene-meta" id="sceneDetailMeta"></div>
                        </div>
                        <div class="scene-content" id="sceneDetailContent">
                            <p>Click on a scene from the left panel to view details.</p>
                        </div>
                    </div>
                </div>
                
                <!-- Stats View -->
                <div id="statsView" class="view-content">
                    <div class="stats-container">
                        <div class="stat-card">
                            <div class="stat-value">${data.metadata.totalEntities}</div>
                            <div class="stat-label">Total Entities</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.metadata.totalRelationships}</div>
                            <div class="stat-label">Relationships</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.metadata.totalScenes}</div>
                            <div class="stat-label">Scenes</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.metadata.totalMutations}</div>
                            <div class="stat-label">State Changes</div>
                        </div>
                    </div>
                </div>
                
                <!-- Entity Drawer -->
                <div class="entity-drawer" id="entityDrawer">
                    <button class="drawer-close" onclick="closeEntityDrawer()">×</button>
                    <div id="entityDrawerContent"></div>
                </div>
                
                <!-- Timeline Controls -->
                <div class="timeline-controls" style="display: none;" id="timelineControls">
                    <button class="play-button" id="playButton">▶</button>
                    <div class="timeline-slider" id="timelineSlider">
                        <div class="timeline-progress" id="timelineProgress"></div>
                    </div>
                    <div class="timeline-info" id="timelineInfo">Scene 1 of ${data.scenes.length}</div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Data from extraction
        const narrativeData = ${JSON.stringify(data)};
        
        // State
        let currentView = 'network';
        let currentScene = null;
        let currentEntity = null;
        let network = null;
        let isPlaying = false;
        let currentSceneIndex = 0;
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            initializeTabs();
            initializeScenesList();
            initializeNetworkView();
            initializeTimelineControls();
        });
        
        // Tab switching
        function initializeTabs() {
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const view = tab.dataset.view;
                    switchView(view);
                });
            });
        }
        
        function switchView(view) {
            currentView = view;
            
            // Update tabs
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelector(\`.tab[data-view="\${view}"]\`).classList.add('active');
            
            // Update content
            document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
            document.getElementById(view + 'View').classList.add('active');
            
            // Show/hide timeline controls
            document.getElementById('timelineControls').style.display = 
                view === 'network' || view === 'timeline' ? 'flex' : 'none';
            
            // Initialize view-specific content
            if (view === 'timeline') {
                initializeTimelineView();
            }
        }
        
        // Scenes list
        function initializeScenesList() {
            const container = document.getElementById('scenesList');
            narrativeData.scenes.forEach((scene, index) => {
                const item = document.createElement('div');
                item.className = 'scene-item';
                item.innerHTML = \`
                    <div class="scene-title">Scene \${scene.sequence}: \${scene.summary}</div>
                    <div class="scene-meta">
                        \${scene.location || 'Unknown location'} • 
                        \${scene.characters.length} characters
                    </div>
                \`;
                item.addEventListener('click', () => selectScene(index));
                container.appendChild(item);
            });
        }
        
        function selectScene(index) {
            currentScene = index;
            currentSceneIndex = index;
            
            // Update UI
            document.querySelectorAll('.scene-item').forEach((item, i) => {
                item.classList.toggle('active', i === index);
            });
            
            // Update scene detail view
            updateSceneDetail(narrativeData.scenes[index]);
            
            // Update network to show scene state
            if (currentView === 'network' && network) {
                updateNetworkForScene(index);
            }
            
            // Update timeline
            updateTimelinePosition(index);
        }
        
        // Network view
        function initializeNetworkView() {
            const container = document.getElementById('networkView');
            
            // Create nodes and edges
            const nodes = new vis.DataSet(narrativeData.entities.map(entity => ({
                id: entity.id,
                label: entity.name,
                group: entity.type,
                title: entity.description || ''
            })));
            
            const edges = new vis.DataSet(narrativeData.relationships.map(rel => ({
                from: rel.source,
                to: rel.target,
                label: rel.type,
                arrows: 'to'
            })));
            
            // Network options
            const options = {
                nodes: {
                    shape: 'dot',
                    size: 20,
                    font: { size: 14, color: '#ffffff' },
                    borderWidth: 2
                },
                edges: {
                    font: { size: 12, color: '#9ca3af', strokeWidth: 0 },
                    color: { color: '#374151' },
                    smooth: { type: 'continuous' }
                },
                groups: {
                    character: { color: { background: '#3730a3', border: '#4c1d95' } },
                    location: { color: { background: '#059669', border: '#047857' } },
                    object: { color: { background: '#dc2626', border: '#b91c1c' } },
                    concept: { color: { background: '#7c3aed', border: '#6d28d9' } },
                    event: { color: { background: '#f59e0b', border: '#d97706' } }
                },
                physics: {
                    enabled: true,
                    solver: 'forceAtlas2Based',
                    stabilization: { iterations: 100 }
                }
            };
            
            // Create network
            network = new vis.Network(container, { nodes, edges }, options);
            
            // Remove loading message
            container.querySelector('.loading').remove();
            
            // Handle node clicks
            network.on('click', (params) => {
                if (params.nodes.length > 0) {
                    const entityId = params.nodes[0];
                    showEntityDetails(entityId);
                }
            });
        }
        
        function updateNetworkForScene(sceneIndex) {
            if (!network) return;
            
            const scene = narrativeData.scenes[sceneIndex];
            const presentIds = new Set(scene.presentEntities);
            
            // Update node visibility/styling
            network.body.data.nodes.forEach(node => {
                const isPresent = presentIds.has(node.id);
                network.body.data.nodes.update({
                    id: node.id,
                    opacity: isPresent ? 1 : 0.3,
                    font: { size: isPresent ? 16 : 12 }
                });
            });
        }
        
        // Entity drawer
        function showEntityDetails(entityId) {
            const entity = narrativeData.entities.find(e => e.id === entityId);
            if (!entity) return;
            
            currentEntity = entity;
            
            // Get relationships
            const relationships = narrativeData.relationships.filter(
                r => r.source === entityId || r.target === entityId
            );
            
            // Get scene appearances
            const appearances = narrativeData.scenes.filter(
                s => s.presentEntities.includes(entityId)
            );
            
            // Build drawer content
            const content = \`
                <h2 class="entity-name">\${entity.name}</h2>
                <div class="entity-type">\${entity.type}</div>
                <div class="entity-description">\${entity.description || 'No description available'}</div>
                
                <div class="relationships-section">
                    <h3 class="section-title">Relationships</h3>
                    \${relationships.map(rel => {
                        const otherEntity = rel.source === entityId
                            ? narrativeData.entities.find(e => e.id === rel.target)
                            : narrativeData.entities.find(e => e.id === rel.source);
                        return \`
                            <div class="relationship-item">
                                <div class="relationship-type">\${rel.type}</div>
                                <div>\${otherEntity ? otherEntity.name : 'Unknown'}</div>
                            </div>
                        \`;
                    }).join('')}
                </div>
                
                <div class="appearances-section">
                    <h3 class="section-title">Scene Appearances</h3>
                    \${appearances.map(scene => \`
                        <div class="relationship-item" style="cursor: pointer;" onclick="selectScene(\${scene.sequence - 1})">
                            Scene \${scene.sequence}: \${scene.title}
                        </div>
                    \`).join('')}
                </div>
            \`;
            
            document.getElementById('entityDrawerContent').innerHTML = content;
            document.getElementById('entityDrawer').classList.add('open');
        }
        
        function closeEntityDrawer() {
            document.getElementById('entityDrawer').classList.remove('open');
        }
        
        // Scene detail view
        function updateSceneDetail(scene) {
            document.getElementById('sceneDetailTitle').textContent = 
                \`Scene \${scene.sequence}: \${scene.title}\`;
            
            document.getElementById('sceneDetailMeta').innerHTML = \`
                <strong>Location:</strong> \${scene.location || 'Unknown'} • 
                <strong>Time:</strong> \${scene.time || 'Not specified'}
            \`;
            
            const entities = scene.presentEntities
                .map(id => narrativeData.entities.find(e => e.id === id))
                .filter(e => e);
            
            document.getElementById('sceneDetailContent').innerHTML = \`
                <p>\${scene.description || 'No description available'}</p>
                
                <h3 class="section-title" style="margin-top: 30px;">Entities Present</h3>
                <div class="entities-grid">
                    \${entities.map(entity => \`
                        <div class="entity-card" onclick="showEntityDetails('\${entity.id}')">
                            <div style="font-weight: 600;">\${entity.name}</div>
                            <div style="font-size: 0.85em; color: #9ca3af;">\${entity.type}</div>
                        </div>
                    \`).join('')}
                </div>
                
                \${scene.entitiesIntroduced.length > 0 ? \`
                    <h3 class="section-title" style="margin-top: 30px;">Introduced</h3>
                    <div class="entities-grid">
                        \${scene.entitiesIntroduced.map(id => {
                            const entity = narrativeData.entities.find(e => e.id === id);
                            return entity ? \`
                                <div class="entity-card" style="border-color: #059669;">
                                    <div style="font-weight: 600;">\${entity.name}</div>
                                    <div style="font-size: 0.85em; color: #059669;">+ New</div>
                                </div>
                            \` : '';
                        }).join('')}
                    </div>
                \` : ''}
                
                \${scene.entitiesRemoved.length > 0 ? \`
                    <h3 class="section-title" style="margin-top: 30px;">Removed</h3>
                    <div class="entities-grid">
                        \${scene.entitiesRemoved.map(id => {
                            const entity = narrativeData.entities.find(e => e.id === id);
                            return entity ? \`
                                <div class="entity-card" style="border-color: #dc2626;">
                                    <div style="font-weight: 600;">\${entity.name}</div>
                                    <div style="font-size: 0.85em; color: #dc2626;">- Removed</div>
                                </div>
                            \` : '';
                        }).join('')}
                    </div>
                \` : ''}
            \`;
            
            // Switch to scene view if not already there
            if (currentView !== 'scene') {
                switchView('scene');
            }
        }
        
        // Timeline view
        function initializeTimelineView() {
            const svg = d3.select('#timelineSvg');
            svg.selectAll('*').remove();
            
            const width = svg.node().getBoundingClientRect().width;
            const height = svg.node().getBoundingClientRect().height;
            const margin = { top: 50, right: 50, bottom: 50, left: 100 };
            
            // Create timeline visualization using commits
            const xScale = d3.scaleLinear()
                .domain([0, narrativeData.commits.length - 1])
                .range([margin.left, width - margin.right]);
            
            const yScale = d3.scaleBand()
                .domain(['scenes', 'entities', 'relationships'])
                .range([margin.top, height - margin.bottom])
                .padding(0.3);
            
            // Add axes
            svg.append('g')
                .attr('transform', \`translate(0,\${height - margin.bottom})\`)
                .call(d3.axisBottom(xScale).tickFormat(d => \`Commit \${d}\`));
            
            svg.append('g')
                .attr('transform', \`translate(\${margin.left},0)\`)
                .call(d3.axisLeft(yScale));
            
            // Add commit points
            narrativeData.commits.forEach((commit, i) => {
                const x = xScale(i);
                
                // Scene changes
                svg.append('circle')
                    .attr('cx', x)
                    .attr('cy', yScale('scenes') + yScale.bandwidth() / 2)
                    .attr('r', 5)
                    .attr('fill', '#3730a3')
                    .attr('opacity', commit.stats.scenesChanged > 0 ? 1 : 0.3);
                
                // Entity changes
                svg.append('circle')
                    .attr('cx', x)
                    .attr('cy', yScale('entities') + yScale.bandwidth() / 2)
                    .attr('r', 5)
                    .attr('fill', '#059669')
                    .attr('opacity', commit.stats.entitiesChanged > 0 ? 1 : 0.3);
                
                // Relationship changes
                svg.append('circle')
                    .attr('cx', x)
                    .attr('cy', yScale('relationships') + yScale.bandwidth() / 2)
                    .attr('r', 5)
                    .attr('fill', '#dc2626')
                    .attr('opacity', commit.stats.relationshipsChanged > 0 ? 1 : 0.3);
            });
        }
        
        // Timeline controls
        function initializeTimelineControls() {
            const playButton = document.getElementById('playButton');
            const slider = document.getElementById('timelineSlider');
            
            playButton.addEventListener('click', togglePlayback);
            slider.addEventListener('click', (e) => {
                const rect = slider.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                const sceneIndex = Math.floor(percent * narrativeData.scenes.length);
                selectScene(Math.max(0, Math.min(sceneIndex, narrativeData.scenes.length - 1)));
            });
        }
        
        function togglePlayback() {
            isPlaying = !isPlaying;
            document.getElementById('playButton').textContent = isPlaying ? '⏸' : '▶';
            
            if (isPlaying) {
                playTimeline();
            }
        }
        
        function playTimeline() {
            if (!isPlaying) return;
            
            currentSceneIndex = (currentSceneIndex + 1) % narrativeData.scenes.length;
            selectScene(currentSceneIndex);
            
            setTimeout(() => playTimeline(), 2000);
        }
        
        function updateTimelinePosition(sceneIndex) {
            const percent = (sceneIndex / (narrativeData.scenes.length - 1)) * 100;
            document.getElementById('timelineProgress').style.width = percent + '%';
            document.getElementById('timelineInfo').textContent = 
                \`Scene \${sceneIndex + 1} of \${narrativeData.scenes.length}\`;
        }
    </script>
</body>
</html>`;

  return html;
}

export function saveEnhancedExplorer(
  data: EnhancedVisualizationData,
  outputPath: string
): void {
  const html = generateEnhancedExplorerHTML(data);
  fs.writeFileSync(outputPath, html);
  console.log(
    `     📄 ${path.basename(outputPath)} (enhanced interactive explorer)`
  );
}
