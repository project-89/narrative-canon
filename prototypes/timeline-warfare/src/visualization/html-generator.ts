import { NarrativeStructure } from '../../../../src/types';

interface VisualizationData {
  narrative: NarrativeStructure;
  graph: any; // TemporalGraphNode structure
  metadata?: {
    sourceFile?: string;
    extractionDate?: string;
    extractionTime?: number;
    usedMockLLM?: boolean;
    characterCount?: number;
    chunkCount?: number;
  };
}

export async function generateVisualizationHTML(data: VisualizationData): Promise<string> {
  const { narrative, graph, metadata } = data;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Narrative Visualization - ${metadata?.sourceFile || 'Unknown'}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vis-timeline@latest/standalone/umd/vis-timeline-graph2d.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/vis-timeline@latest/styles/vis-timeline-graph2d.min.css" rel="stylesheet" type="text/css" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            overflow-x: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            padding: 2rem;
            border-bottom: 1px solid #333;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .metadata {
            display: flex;
            gap: 2rem;
            font-size: 0.9rem;
            color: #888;
        }
        
        .metadata span {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .tabs {
            display: flex;
            background: #1a1a1a;
            border-bottom: 1px solid #333;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .tab {
            padding: 1rem 2rem;
            cursor: pointer;
            border: none;
            background: none;
            color: #888;
            font-size: 1rem;
            transition: all 0.3s ease;
            position: relative;
        }
        
        .tab:hover {
            color: #fff;
        }
        
        .tab.active {
            color: #4CAF50;
        }
        
        .tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: #4CAF50;
        }
        
        .content {
            min-height: calc(100vh - 200px);
            padding: 2rem;
        }
        
        .panel {
            display: none;
        }
        
        .panel.active {
            display: block;
        }
        
        /* Timeline Styles */
        #timeline {
            height: 600px;
            background: #1a1a1a;
            border-radius: 8px;
            padding: 1rem;
        }
        
        .vis-timeline {
            border: none !important;
        }
        
        .vis-item {
            background: #2a2a2a !important;
            border-color: #4CAF50 !important;
            color: #fff !important;
        }
        
        .vis-item.vis-selected {
            background: #4CAF50 !important;
            color: #000 !important;
        }
        
        /* Graph Styles */
        #graph-container {
            width: 100%;
            height: 600px;
            background: #1a1a1a;
            border-radius: 8px;
            position: relative;
        }
        
        .node {
            cursor: pointer;
        }
        
        .node circle {
            stroke-width: 3px;
            transition: all 0.3s ease;
        }
        
        .node:hover circle {
            stroke-width: 5px;
            filter: brightness(1.2);
        }
        
        .node text {
            font-size: 12px;
            pointer-events: none;
            text-anchor: middle;
            fill: #fff;
            text-shadow: 0 0 3px #000;
        }
        
        .link {
            stroke: #666;
            stroke-opacity: 0.6;
            stroke-width: 2px;
            fill: none;
        }
        
        .link.highlighted {
            stroke: #4CAF50;
            stroke-opacity: 1;
            stroke-width: 3px;
        }
        
        /* Character Grid */
        .character-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
        }
        
        .character-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }
        
        .character-card:hover {
            border-color: #4CAF50;
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(76, 175, 80, 0.3);
        }
        
        .character-name {
            font-size: 1.2rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
            color: #4CAF50;
        }
        
        .character-description {
            color: #aaa;
            line-height: 1.6;
        }
        
        /* Scene List */
        .scene-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .scene-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }
        
        .scene-card:hover {
            border-color: #4CAF50;
        }
        
        .scene-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .scene-title {
            font-size: 1.1rem;
            color: #4CAF50;
        }
        
        .scene-sequence {
            background: #2a2a2a;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.9rem;
        }
        
        .scene-description {
            color: #aaa;
            line-height: 1.6;
            margin-bottom: 1rem;
        }
        
        .scene-metadata {
            display: flex;
            gap: 1rem;
            font-size: 0.9rem;
            color: #666;
        }
        
        /* Relationships */
        .relationship-container {
            display: flex;
            gap: 2rem;
        }
        
        .relationship-filters {
            flex: 0 0 250px;
            background: #1a1a1a;
            border-radius: 8px;
            padding: 1.5rem;
            height: fit-content;
            position: sticky;
            top: 100px;
        }
        
        .relationship-graph {
            flex: 1;
            height: 600px;
            background: #1a1a1a;
            border-radius: 8px;
        }
        
        .filter-group {
            margin-bottom: 1.5rem;
        }
        
        .filter-label {
            font-size: 0.9rem;
            color: #888;
            margin-bottom: 0.5rem;
        }
        
        .filter-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
            cursor: pointer;
        }
        
        .filter-option input[type="checkbox"] {
            accent-color: #4CAF50;
        }
        
        /* Summary Stats */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2.5rem;
            font-weight: bold;
            color: #4CAF50;
            margin-bottom: 0.5rem;
        }
        
        .stat-label {
            color: #888;
            font-size: 0.9rem;
        }
        
        /* Details Panel */
        .details-panel {
            position: fixed;
            right: -400px;
            top: 0;
            width: 400px;
            height: 100vh;
            background: #1a1a1a;
            border-left: 1px solid #333;
            transition: right 0.3s ease;
            overflow-y: auto;
            z-index: 1000;
            padding: 2rem;
        }
        
        .details-panel.open {
            right: 0;
        }
        
        .details-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: none;
            border: none;
            color: #888;
            font-size: 1.5rem;
            cursor: pointer;
        }
        
        .details-close:hover {
            color: #fff;
        }
        
        /* Loading State */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 400px;
            font-size: 1.2rem;
            color: #666;
        }
        
        .loading::after {
            content: '...';
            animation: dots 1.5s steps(4, end) infinite;
        }
        
        @keyframes dots {
            0%, 20% { content: ''; }
            40% { content: '.'; }
            60% { content: '..'; }
            80%, 100% { content: '...'; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Narrative Visualization</h1>
        <div class="metadata">
            ${metadata ? `
                <span>📄 ${metadata.sourceFile}</span>
                <span>📅 ${new Date(metadata.extractionDate || '').toLocaleDateString()}</span>
                <span>⏱️ ${((metadata.extractionTime || 0) / 1000).toFixed(2)}s</span>
                <span>🤖 ${metadata.usedMockLLM ? 'Mock LLM' : 'Real LLM'}</span>
                <span>📊 ${(metadata.characterCount || 0).toLocaleString()} chars</span>
            ` : ''}
        </div>
    </div>
    
    <div class="tabs">
        <button class="tab active" onclick="showTab('summary')">Summary</button>
        <button class="tab" onclick="showTab('timeline')">Timeline</button>
        <button class="tab" onclick="showTab('characters')">Characters</button>
        <button class="tab" onclick="showTab('scenes')">Scenes</button>
        <button class="tab" onclick="showTab('relationships')">Relationships</button>
        <button class="tab" onclick="showTab('graph')">Temporal Graph</button>
    </div>
    
    <div class="content">
        <!-- Summary Panel -->
        <div id="summary" class="panel active">
            <div class="summary-grid">
                <div class="stat-card">
                    <div class="stat-value">${narrative.entities.length}</div>
                    <div class="stat-label">Characters</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${narrative.scenes.length}</div>
                    <div class="stat-label">Scenes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${narrative.relationships.length}</div>
                    <div class="stat-label">Relationships</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${narrative.stateChanges.length}</div>
                    <div class="stat-label">State Changes</div>
                </div>
            </div>
            
            <h2 style="margin: 2rem 0 1rem; color: #4CAF50;">Narrative Overview</h2>
            <div style="background: #1a1a1a; padding: 2rem; border-radius: 8px;">
                <p style="line-height: 1.8; color: #aaa;">
                    This narrative contains ${narrative.entities.length} distinct characters across ${narrative.scenes.length} scenes. 
                    The story progression includes ${narrative.stateChanges.length} significant state changes and reveals 
                    ${narrative.relationships.length} relationships between characters.
                </p>
            </div>
        </div>
        
        <!-- Timeline Panel -->
        <div id="timeline" class="panel">
            <div class="loading">Loading timeline</div>
        </div>
        
        <!-- Characters Panel -->
        <div id="characters" class="panel">
            <div class="character-grid">
                ${narrative.entities.map(entity => `
                    <div class="character-card" onclick="showCharacterDetails('${entity.id}')">
                        <div class="character-name">${entity.name}</div>
                        <div class="character-description">${entity.description || 'No description available'}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <!-- Scenes Panel -->
        <div id="scenes" class="panel">
            <div class="scene-list">
                ${narrative.scenes.map(scene => `
                    <div class="scene-card">
                        <div class="scene-header">
                            <div class="scene-title">Scene ${scene.sequence}</div>
                            <div class="scene-sequence">#${scene.sequence}</div>
                        </div>
                        <div class="scene-description">${(scene as any).summary || scene.description}</div>
                        <div class="scene-metadata">
                            <span>📍 ${scene.location || 'Unknown location'}</span>
                            <span>👥 ${scene.characters.length} characters</span>
                            <span>🎬 ${scene.events?.length || 0} events</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <!-- Relationships Panel -->
        <div id="relationships" class="panel">
            <div class="relationship-container">
                <div class="relationship-filters">
                    <div class="filter-group">
                        <div class="filter-label">Relationship Types</div>
                        ${Array.from(new Set(narrative.relationships.map(r => r.type))).map(type => `
                            <label class="filter-option">
                                <input type="checkbox" checked onchange="filterRelationships()">
                                <span>${type}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div id="relationship-graph" class="relationship-graph"></div>
            </div>
        </div>
        
        <!-- Temporal Graph Panel -->
        <div id="graph" class="panel">
            <div id="graph-container"></div>
        </div>
    </div>
    
    <!-- Details Panel -->
    <div id="details-panel" class="details-panel">
        <button class="details-close" onclick="closeDetails()">✕</button>
        <div id="details-content"></div>
    </div>
    
    <script>
        // Store narrative data globally
        window.narrativeData = ${JSON.stringify(data)};
        
        // Tab switching
        function showTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            event.target.classList.add('active');
            
            // Update panels
            document.querySelectorAll('.panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
            
            // Initialize visualizations on first load
            if (tabName === 'timeline' && !window.timelineInitialized) {
                initializeTimeline();
                window.timelineInitialized = true;
            } else if (tabName === 'graph' && !window.graphInitialized) {
                initializeGraph();
                window.graphInitialized = true;
            } else if (tabName === 'relationships' && !window.relationshipsInitialized) {
                initializeRelationshipGraph();
                window.relationshipsInitialized = true;
            }
        }
        
        // Initialize Timeline
        function initializeTimeline() {
            const container = document.getElementById('timeline');
            container.innerHTML = ''; // Clear loading message
            
            // Convert narrative events to timeline items
            const items = narrativeData.narrative.chronology.map((event, i) => ({
                id: i,
                content: event.description,
                start: new Date(2025, 0, 1 + i), // Mock dates for now
                type: event.type === 'scene' ? 'box' : 'point'
            }));
            
            // Create timeline
            const timeline = new vis.Timeline(container, items, {
                height: '100%',
                margin: { item: 10 },
                orientation: 'both'
            });
        }
        
        // Initialize Temporal Graph
        function initializeGraph() {
            const container = document.getElementById('graph-container');
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            // Clear any existing content
            d3.select(container).selectAll("*").remove();
            
            const svg = d3.select(container)
                .append('svg')
                .attr('width', width)
                .attr('height', height);
            
            // Create force simulation
            const simulation = d3.forceSimulation()
                .force('link', d3.forceLink().id(d => d.id).distance(100))
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2));
            
            // Convert narrative data to graph nodes and links
            const nodes = narrativeData.narrative.entities.map(entity => ({
                id: entity.id,
                name: entity.name,
                type: entity.type || 'character',
                description: entity.description
            }));
            
            const links = narrativeData.narrative.relationships.map(rel => ({
                source: rel.source,
                target: rel.target,
                type: rel.type,
                description: rel.description
            }));
            
            // Add links
            const link = svg.append('g')
                .selectAll('line')
                .data(links)
                .enter().append('line')
                .attr('class', 'link');
            
            // Add nodes
            const node = svg.append('g')
                .selectAll('.node')
                .data(nodes)
                .enter().append('g')
                .attr('class', 'node')
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended));
            
            // Add circles for nodes
            node.append('circle')
                .attr('r', 10)
                .attr('fill', d => {
                    const colors = {
                        character: '#4CAF50',
                        location: '#2196F3',
                        object: '#FF9800',
                        organization: '#9C27B0',
                        concept: '#00BCD4'
                    };
                    return colors[d.type] || '#666';
                });
            
            // Add labels
            node.append('text')
                .text(d => d.name)
                .attr('y', -15);
            
            // Add tooltips
            node.append('title')
                .text(d => d.description || d.name);
            
            // Update positions on tick
            simulation
                .nodes(nodes)
                .on('tick', ticked);
            
            simulation.force('link')
                .links(links);
            
            function ticked() {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
                
                node
                    .attr('transform', d => \`translate(\${d.x},\${d.y})\`);
            }
            
            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }
            
            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }
            
            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }
        }
        
        // Initialize Relationship Graph
        function initializeRelationshipGraph() {
            const container = document.getElementById('relationship-graph');
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            // This would be similar to the temporal graph but with different layout
            // For now, we'll use a placeholder
            container.innerHTML = '<div class="loading">Relationship graph visualization</div>';
        }
        
        // Show character details
        function showCharacterDetails(characterId) {
            const character = narrativeData.narrative.entities.find(e => e.id === characterId);
            if (!character) return;
            
            const panel = document.getElementById('details-panel');
            const content = document.getElementById('details-content');
            
            content.innerHTML = \`
                <h2 style="color: #4CAF50; margin-bottom: 1rem;">\${character.name}</h2>
                <p style="color: #aaa; line-height: 1.6; margin-bottom: 2rem;">\${character.description || 'No description available'}</p>
                
                <h3 style="color: #fff; margin-bottom: 1rem;">Relationships</h3>
                <div style="margin-bottom: 2rem;">
                    \${narrativeData.narrative.relationships
                        .filter(r => r.source === characterId || r.target === characterId)
                        .map(r => \`
                            <div style="background: #2a2a2a; padding: 1rem; border-radius: 4px; margin-bottom: 0.5rem;">
                                <strong>\${r.type}</strong> with \${r.source === characterId ? r.target : r.source}
                                \${r.description ? \`<br><span style="color: #888; font-size: 0.9rem;">\${r.description}</span>\` : ''}
                            </div>
                        \`).join('')}
                </div>
                
                <h3 style="color: #fff; margin-bottom: 1rem;">Appears in Scenes</h3>
                <div>
                    \${narrativeData.narrative.scenes
                        .filter(s => s.characters.includes(characterId))
                        .map(s => \`
                            <div style="background: #2a2a2a; padding: 1rem; border-radius: 4px; margin-bottom: 0.5rem;">
                                Scene \${s.sequence}: \${s.description.substring(0, 100)}...
                            </div>
                        \`).join('')}
                </div>
            \`;
            
            panel.classList.add('open');
        }
        
        // Close details panel
        function closeDetails() {
            document.getElementById('details-panel').classList.remove('open');
        }
        
        // Filter relationships
        function filterRelationships() {
            // This would filter the relationship graph
            console.log('Filtering relationships...');
        }
    </script>
</body>
</html>`;
}