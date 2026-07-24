/**
 * Example of using the LLM Query Interface
 * Demonstrates natural language querying with wildcard support
 */

import { MongoNarrativeAdapter } from '../src/storage/mongodb-adapter';
import { TemporalNarrativeGraph } from '../src/core/temporal-graph';
import { GraphQueryEngine, LLMQueryInterface } from '../src/queries';
import mongoose from 'mongoose';

async function demonstrateLLMQueries() {
  // Set up the system (you would normally have this already configured)
  const connection = mongoose.createConnection('mongodb://localhost:27017/narrative-demo');
  const adapter = new MongoNarrativeAdapter({ connection });
  const temporalGraph = new TemporalNarrativeGraph();
  const queryEngine = new GraphQueryEngine(adapter, temporalGraph);
  const llmInterface = new LLMQueryInterface(queryEngine);

  console.log('=== LLM Query Interface Demo ===\n');

  // Example 1: Location-based queries
  console.log('1. Location Events Query:');
  try {
    const result1 = await llmInterface.executeNaturalLanguageQuery("What happened at Neo-Tokyo?");
    console.log(`Query Type: ${result1.queryType}`);
    console.log(`Results: ${result1.resultCount} events found`);
    console.log(`Explanation: ${result1.explanation}`);
    console.log(`Execution Time: ${result1.executionTime}ms`);
    console.log('Suggested follow-ups:', result1.suggestedFollowups);
  } catch (error) {
    console.log('Query failed:', error.message);
  }
  console.log('');

  // Example 2: Object interaction queries with wildcards
  console.log('2. Object Interaction Query (with wildcards):');
  try {
    const result2 = await llmInterface.executeObjectQuery({
      objectName: 'Neural Sword',
      interactionTypes: ['*'] // All interaction types
    });
    console.log(`Found ${result2.length} interactions with Neural Sword`);
    result2.forEach(interaction => {
      console.log(`  - ${interaction.entityName} ${interaction.interactionType} (Event: ${interaction.eventId})`);
    });
  } catch (error) {
    console.log('Query failed:', error.message);
  }
  console.log('');

  // Example 3: Entity path queries
  console.log('3. Entity Path Query:');
  try {
    const result3 = await llmInterface.executeNaturalLanguageQuery("How are Alice and Bob connected?");
    console.log(`Query Type: ${result3.queryType}`);
    console.log(`Results: ${result3.resultCount} paths found`);
    if (result3.results.length > 0) {
      result3.results.forEach((path: any) => {
        console.log(`  Path: ${path.pathDescription}`);
      });
    }
  } catch (error) {
    console.log('Query failed:', error.message);
  }
  console.log('');

  // Example 4: Temporal queries with wildcards
  console.log('4. Temporal Event Query (with wildcards):');
  try {
    const result4 = await llmInterface.executeTemporalQuery({
      entityId: 'alice',
      eventTypes: ['*'] // All event types
    });
    console.log(`Found ${result4.length} events involving Alice`);
    result4.forEach(event => {
      console.log(`  - ${event.type}: ${event.description} (${event.location})`);
    });
  } catch (error) {
    console.log('Query failed:', error.message);
  }
  console.log('');

  // Example 5: Query examples and schemas for LLM training
  console.log('5. Available Query Examples:');
  const examples = llmInterface.getQueryExamples();
  Object.entries(examples).forEach(([type, typeExamples]) => {
    console.log(`  ${type}:`);
    typeExamples.slice(0, 2).forEach(example => {
      console.log(`    - "${example}"`);
    });
  });
  console.log('');

  console.log('6. Available Zod Schemas for LLM Integration:');
  const schemas = llmInterface.getQuerySchemas();
  console.log('Schema types available:', Object.keys(schemas));
  console.log('');

  // Clean up
  await connection.close();
}

// Main execution
if (require.main === module) {
  demonstrateLLMQueries()
    .then(() => {
      console.log('Demo completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Demo failed:', error);
      process.exit(1);
    });
}

export { demonstrateLLMQueries };