# Deployment Guide for Narrative Canon MCP Server

This guide covers various deployment scenarios for the Narrative Canon MCP Server.

## Local Development Setup

### Prerequisites
- Node.js 18 or higher
- MongoDB 6.0 or higher
- Git

### Quick Start
```bash
# Clone and navigate to the project
git clone <repository-url>
cd narrative-canon/mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Set up environment
export MONGO_URL="mongodb://localhost:27017"
export DB_NAME="narrative-canon-dev"
export ENABLE_EXTRACTION="true"

# Start MongoDB (if not running)
brew services start mongodb-community  # macOS
# or
sudo systemctl start mongod  # Linux

# Test the server
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node dist/server.js
```

## Claude Desktop Integration

### Configuration File Location

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Basic Configuration
```json
{
  "mcpServers": {
    "narrative-canon": {
      "command": "node",
      "args": ["/absolute/path/to/narrative-canon/mcp-server/dist/server.js"],
      "env": {
        "MONGO_URL": "mongodb://localhost:27017",
        "DB_NAME": "narrative-canon",
        "ENABLE_EXTRACTION": "true"
      }
    }
  }
}
```

### Development Configuration
```json
{
  "mcpServers": {
    "narrative-canon-dev": {
      "command": "node",
      "args": ["/path/to/narrative-canon/mcp-server/dist/server.js"],
      "env": {
        "MONGO_URL": "mongodb://localhost:27017",
        "DB_NAME": "narrative-canon-dev",
        "ENABLE_EXTRACTION": "true",
        "MAX_RESULTS": "50"
      }
    }
  }
}
```

### Production Configuration
```json
{
  "mcpServers": {
    "narrative-canon-prod": {
      "command": "node",
      "args": ["/path/to/narrative-canon/mcp-server/dist/server.js"],
      "env": {
        "MONGO_URL": "mongodb://production-host:27017",
        "DB_NAME": "narrative-canon-prod",
        "ENABLE_EXTRACTION": "false",
        "MAX_RESULTS": "200"
      }
    }
  }
}
```

## Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S narrative -u 1001
USER narrative

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  narrative-canon-mcp:
    build: .
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=narrative-canon
      - ENABLE_EXTRACTION=true
    depends_on:
      - mongodb
    stdin_open: true
    tty: true

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init:/docker-entrypoint-initdb.d
    environment:
      - MONGO_INITDB_DATABASE=narrative-canon

volumes:
  mongodb_data:
```

### Running with Docker
```bash
# Build and start services
docker-compose up -d

# Test the MCP server
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | \
  docker-compose exec narrative-canon-mcp node dist/server.js
```

## Production Deployment

### System Requirements
- **CPU**: 2+ cores recommended
- **RAM**: 4GB+ for moderate workloads
- **Storage**: 10GB+ for database and logs
- **Network**: Reliable connection to MongoDB

### Environment Setup
```bash
# Create dedicated user
sudo useradd -r -s /bin/false narrative-canon

# Create application directory
sudo mkdir -p /opt/narrative-canon-mcp
sudo chown narrative-canon:narrative-canon /opt/narrative-canon-mcp

# Install application
sudo -u narrative-canon git clone <repo> /opt/narrative-canon-mcp
cd /opt/narrative-canon-mcp/mcp-server
sudo -u narrative-canon npm ci --only=production
sudo -u narrative-canon npm run build
```

### Systemd Service
Create `/etc/systemd/system/narrative-canon-mcp.service`:

```ini
[Unit]
Description=Narrative Canon MCP Server
After=network.target mongodb.service
Requires=mongodb.service

[Service]
Type=simple
User=narrative-canon
Group=narrative-canon
WorkingDirectory=/opt/narrative-canon-mcp/mcp-server
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

# Environment
Environment=MONGO_URL=mongodb://localhost:27017
Environment=DB_NAME=narrative-canon-prod
Environment=ENABLE_EXTRACTION=false
Environment=MAX_RESULTS=100

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/narrative-canon-mcp

# Resource limits
LimitNOFILE=65535
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

### Start and Enable Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable narrative-canon-mcp
sudo systemctl start narrative-canon-mcp
sudo systemctl status narrative-canon-mcp
```

## MongoDB Configuration

### Local Development
```bash
# Start MongoDB with default settings
mongod --dbpath /usr/local/var/mongodb --logpath /usr/local/var/log/mongodb/mongo.log --fork
```

### Production MongoDB
```javascript
// Connect to MongoDB and create indexes
use narrative-canon-prod

// Entity indexes
db.narrativeentities.createIndex({ "entityId": 1 }, { unique: true })
db.narrativeentities.createIndex({ "type": 1, "canonicalStatus": 1 })
db.narrativeentities.createIndex({ "name": "text", "aliases": "text" })

// Relationship indexes  
db.narrativerelationships.createIndex({ "sourceEntityId": 1, "targetEntityId": 1 })
db.narrativerelationships.createIndex({ "relationshipType": 1, "confidenceScore": -1 })

// Scene indexes
db.narrativescenes.createIndex({ "documentId": 1, "sequence": 1 })
db.narrativescenes.createIndex({ "characters": 1 })
db.narrativescenes.createIndex({ "entities": 1 })
```

### MongoDB Security
```javascript
// Create application user
use admin
db.createUser({
  user: "narrative-canon-app",
  pwd: "secure-password-here",
  roles: [
    { role: "readWrite", db: "narrative-canon-prod" }
  ]
})
```

Update connection string:
```bash
export MONGO_URL="mongodb://narrative-canon-app:secure-password-here@localhost:27017/narrative-canon-prod"
```

## Load Balancing & Scaling

### Multiple MCP Server Instances
```json
{
  "mcpServers": {
    "narrative-canon-primary": {
      "command": "node",
      "args": ["/path/to/server1/dist/server.js"],
      "env": {
        "MONGO_URL": "mongodb://primary-host:27017",
        "DB_NAME": "narrative-canon"
      }
    },
    "narrative-canon-secondary": {
      "command": "node", 
      "args": ["/path/to/server2/dist/server.js"],
      "env": {
        "MONGO_URL": "mongodb://secondary-host:27017",
        "DB_NAME": "narrative-canon-readonly"
      }
    }
  }
}
```

### MongoDB Replica Set
```javascript
// Initialize replica set
rs.initiate({
  _id: "narrative-rs",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },
    { _id: 1, host: "mongo2:27017", priority: 1 },
    { _id: 2, host: "mongo3:27017", priority: 1 }
  ]
})
```

Connection string:
```bash
export MONGO_URL="mongodb://mongo1:27017,mongo2:27017,mongo3:27017/narrative-canon?replicaSet=narrative-rs"
```

## Monitoring & Logging

### Application Logs
```bash
# View logs
sudo journalctl -u narrative-canon-mcp -f

# Log rotation
sudo systemctl edit narrative-canon-mcp
```

Add to override:
```ini
[Service]
StandardOutput=journal
StandardError=journal
SyslogIdentifier=narrative-canon-mcp
```

### Health Checks
```bash
#!/bin/bash
# health-check.sh

# Test MCP server response
response=$(echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | \
  timeout 10 node /opt/narrative-canon-mcp/mcp-server/dist/server.js 2>/dev/null)

if echo "$response" | grep -q "tools"; then
  echo "✅ MCP Server healthy"
  exit 0
else
  echo "❌ MCP Server unhealthy"
  exit 1
fi
```

### Monitoring with Prometheus
Add to server.ts:
```typescript
import promClient from 'prom-client';

const requestDuration = new promClient.Histogram({
  name: 'mcp_request_duration_seconds',
  help: 'Duration of MCP requests',
  labelNames: ['tool_name', 'status']
});

const requestCounter = new promClient.Counter({
  name: 'mcp_requests_total',
  help: 'Total MCP requests',
  labelNames: ['tool_name', 'status']
});
```

## Backup & Recovery

### Database Backup
```bash
#!/bin/bash
# backup-narrative-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/narrative-canon"
DB_NAME="narrative-canon-prod"

mkdir -p "$BACKUP_DIR"

# Create backup
mongodump --db "$DB_NAME" --out "$BACKUP_DIR/$DATE"

# Compress
tar -czf "$BACKUP_DIR/narrative-canon-$DATE.tar.gz" -C "$BACKUP_DIR" "$DATE"
rm -rf "$BACKUP_DIR/$DATE"

# Keep only last 7 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "✅ Backup completed: narrative-canon-$DATE.tar.gz"
```

### Automated Backups
```bash
# Add to crontab
sudo crontab -e

# Backup every day at 2 AM
0 2 * * * /opt/narrative-canon-mcp/scripts/backup-narrative-db.sh
```

### Recovery
```bash
# Restore from backup
tar -xzf narrative-canon-20240315_020001.tar.gz
mongorestore --db narrative-canon-prod --drop narrative-canon-20240315_020001/narrative-canon-prod/
```

## Security Considerations

### Network Security
- Run MongoDB on private network only
- Use MongoDB authentication
- Enable TLS for MongoDB connections
- Firewall rules to restrict access

### Application Security
- Run as non-root user
- Use environment variables for secrets
- Validate all inputs
- Rate limiting for extraction operations

### Data Privacy
- Encrypt sensitive narrative content
- Implement data retention policies
- Audit access to narrative data
- Comply with relevant privacy regulations

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check network connectivity
telnet localhost 27017

# Review MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

2. **MCP Server Not Responding**
```bash
# Check service status
sudo systemctl status narrative-canon-mcp

# Review application logs
sudo journalctl -u narrative-canon-mcp -n 50

# Test manually
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | \
  node /opt/narrative-canon-mcp/mcp-server/dist/server.js
```

3. **High Memory Usage**
```bash
# Monitor memory
ps aux | grep node

# Check for memory leaks
node --inspect dist/server.js

# Reduce max results
export MAX_RESULTS=50
```

4. **Claude Desktop Integration Issues**
```bash
# Check Claude logs
tail -f ~/Library/Logs/Claude/mcp.log

# Validate configuration
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .

# Restart Claude Desktop
```

### Performance Tuning

1. **Database Optimization**
```javascript
// Add compound indexes for frequent queries
db.narrativeentities.createIndex({ "type": 1, "significance": -1 })
db.narrativerelationships.createIndex({ "sourceEntityId": 1, "relationshipType": 1 })
```

2. **Memory Management**
```bash
# Set Node.js memory limits
export NODE_OPTIONS="--max-old-space-size=2048"
```

3. **Query Optimization**
- Use pagination for large result sets
- Apply filters to reduce data transfer
- Cache frequently accessed data

This deployment guide provides comprehensive instructions for various deployment scenarios. Choose the approach that best fits your infrastructure and requirements.