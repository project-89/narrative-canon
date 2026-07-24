#!/usr/bin/env node

/**
 * Project 89 Timeline Visualizer
 * 
 * Creates an interactive HTML visualization of the extracted Project 89 narrative timeline
 */

const fs = require('fs').promises;
const path = require('path');

async function generateTimelineVisualization() {
  console.log('🎨 Generating Project 89 Timeline Visualization...\n');
  
  try {
    // Load the extracted timeline data
    const timelineData = JSON.parse(
      await fs.readFile(path.join(__dirname, 'project89-timeline.json'), 'utf-8')
    );
    
    // Generate HTML visualization
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project 89 - Narrative Timeline</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Courier New', monospace;
            background: #0a0a0a;
            color: #00ff00;
            overflow-x: hidden;
        }
        
        .header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-bottom: 2px solid #00ff00;
            z-index: 1000;
        }
        
        .header h1 {
            font-size: 24px;
            text-shadow: 0 0 10px #00ff00;
            margin-bottom: 10px;
        }
        
        .branch-selector {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        
        .branch-btn {
            background: transparent;
            border: 1px solid #00ff00;
            color: #00ff00;
            padding: 8px 16px;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
        }
        
        .branch-btn:hover {
            background: #00ff00;
            color: #000;
            box-shadow: 0 0 20px #00ff00;
        }
        
        .branch-btn.active {
            background: #00ff00;
            color: #000;
        }
        
        .timeline-container {
            margin-top: 120px;
            padding: 40px 20px;
            min-height: 100vh;
            position: relative;
        }
        
        .timeline-line {
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: linear-gradient(to bottom, #00ff00, #008800);
            transform: translateX(-50%);
        }
        
        .timeline-event {
            position: relative;
            margin: 40px 0;
            padding: 20px;
            width: 45%;
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid #00ff00;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .timeline-event:nth-child(odd) {
            margin-left: auto;
            margin-right: 5%;
        }
        
        .timeline-event:nth-child(even) {
            margin-right: auto;
            margin-left: 5%;
        }
        
        .timeline-event:hover {
            background: rgba(0, 255, 0, 0.2);
            box-shadow: 0 0 30px #00ff00;
            transform: scale(1.02);
        }
        
        .timeline-event::before {
            content: '';
            position: absolute;
            width: 20px;
            height: 20px;
            background: #00ff00;
            border: 3px solid #000;
            border-radius: 50%;
            top: 50%;
            transform: translateY(-50%);
        }
        
        .timeline-event:nth-child(odd)::before {
            left: -45px;
        }
        
        .timeline-event:nth-child(even)::before {
            right: -45px;
        }
        
        .event-date {
            font-size: 14px;
            color: #00ff00;
            margin-bottom: 10px;
            opacity: 0.8;
        }
        
        .event-title {
            font-size: 18px;
            margin-bottom: 10px;
            text-shadow: 0 0 5px #00ff00;
        }
        
        .event-stats {
            display: flex;
            gap: 20px;
            font-size: 12px;
            opacity: 0.7;
        }
        
        .entity-network {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #00ff00;
            padding: 20px;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .entity-network h3 {
            margin-bottom: 15px;
            text-shadow: 0 0 10px #00ff00;
        }
        
        .entity-item {
            margin: 10px 0;
            padding: 5px;
            border-left: 2px solid #00ff00;
            padding-left: 10px;
            font-size: 14px;
        }
        
        .glitch {
            animation: glitch 2s infinite;
        }
        
        @keyframes glitch {
            0%, 100% { text-shadow: 0 0 5px #00ff00; }
            25% { text-shadow: -2px 0 5px #ff0000, 2px 0 5px #0000ff; }
            50% { text-shadow: 2px 0 5px #ff0000, -2px 0 5px #0000ff; }
            75% { text-shadow: 0 0 10px #00ff00, 0 0 20px #00ff00; }
        }
        
        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 24px;
            animation: pulse 1s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }
        
        @media (max-width: 768px) {
            .timeline-event {
                width: 90%;
                margin: 20px auto !important;
            }
            
            .timeline-event::before {
                display: none;
            }
            
            .entity-network {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="glitch">PROJECT 89 - NARRATIVE TIMELINE</h1>
        <div class="branch-selector" id="branchSelector"></div>
    </div>
    
    <div class="timeline-container" id="timelineContainer">
        <div class="timeline-line"></div>
        <div class="loading">LOADING TIMELINE DATA...</div>
    </div>
    
    <div class="entity-network" id="entityNetwork">
        <h3>ENTITY NETWORK</h3>
        <div id="entityList"></div>
    </div>
    
    <script>
        // Timeline data embedded
        const timelineData = ${JSON.stringify(timelineData, null, 2)};
        
        let currentBranch = 'main-timeline';
        
        function initializeBranchSelector() {
            const selector = document.getElementById('branchSelector');
            Object.keys(timelineData.branches).forEach(branch => {
                const btn = document.createElement('button');
                btn.className = 'branch-btn';
                btn.textContent = branch.toUpperCase();
                btn.onclick = () => switchBranch(branch);
                if (branch === currentBranch) btn.classList.add('active');
                selector.appendChild(btn);
            });
        }
        
        function switchBranch(branch) {
            currentBranch = branch;
            document.querySelectorAll('.branch-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent === branch.toUpperCase());
            });
            renderTimeline();
        }
        
        function renderTimeline() {
            const container = document.getElementById('timelineContainer');
            container.innerHTML = '<div class="timeline-line"></div>';
            
            const events = timelineData.branches[currentBranch];
            if (!events || events.length === 0) {
                container.innerHTML += '<div class="loading">NO EVENTS IN THIS TIMELINE</div>';
                return;
            }
            
            events.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            events.forEach((event, index) => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'timeline-event';
                eventDiv.innerHTML = \`
                    <div class="event-date">\${new Date(event.date).toLocaleDateString()}</div>
                    <div class="event-title">\${event.title}</div>
                    <div class="event-stats">
                        <span>Entities: \${event.entities}</span>
                        <span>Relations: \${event.relationships}</span>
                    </div>
                \`;
                eventDiv.onclick = () => showEventDetails(event);
                container.appendChild(eventDiv);
            });
        }
        
        function showEventDetails(event) {
            console.log('Event details:', event);
            // Could expand to show modal with full event data
        }
        
        function renderEntityNetwork() {
            const entityList = document.getElementById('entityList');
            entityList.innerHTML = '';
            
            // Show first 10 characters
            const characters = timelineData.entities
                .filter(e => e.type === 'character')
                .slice(0, 10);
            
            characters.forEach(char => {
                const div = document.createElement('div');
                div.className = 'entity-item';
                div.innerHTML = \`<strong>\${char.name}</strong><br>
                    \${char.attributes.role || 'Unknown Role'}\`;
                entityList.appendChild(div);
            });
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            initializeBranchSelector();
            renderTimeline();
            renderEntityNetwork();
        });
        
        // Add glitch effect periodically
        setInterval(() => {
            const title = document.querySelector('h1');
            title.style.animation = 'none';
            setTimeout(() => title.style.animation = 'glitch 2s infinite', 10);
        }, 10000);
    </script>
</body>
</html>`;
    
    // Save the visualization
    await fs.writeFile(
      path.join(__dirname, 'project89-timeline-viz.html'),
      html
    );
    
    console.log('✅ Visualization saved to project89-timeline-viz.html');
    console.log('🌐 Open the file in a browser to explore the timeline!\n');
    
  } catch (error) {
    console.error('❌ Visualization generation failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  generateTimelineVisualization().catch(console.error);
}

module.exports = { generateTimelineVisualization };