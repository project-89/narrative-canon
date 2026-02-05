/**
 * Test our Zod to Gemini schema conversion
 */

import { z } from 'zod';
import { SchemaType } from '@google/generative-ai';

// Copy the conversion logic for testing
function zodToJsonSchema(schema: z.ZodSchema<any>): any {
  return zodTypeToJsonSchema(schema);
}

function zodTypeToJsonSchema(schema: z.ZodSchema<any>): any {
  if (schema instanceof z.ZodString) {
    return { type: SchemaType.STRING };
  }
  
  if (schema instanceof z.ZodNumber) {
    return { type: SchemaType.NUMBER };
  }
  
  if (schema instanceof z.ZodBoolean) {
    return { type: SchemaType.BOOLEAN };
  }
  
  if (schema instanceof z.ZodArray) {
    return {
      type: SchemaType.ARRAY,
      items: zodTypeToJsonSchema(schema.element)
    };
  }
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodSchema<any>;
      
      if (fieldSchema instanceof z.ZodOptional) {
        properties[key] = zodTypeToJsonSchema(fieldSchema.unwrap());
      } else {
        properties[key] = zodTypeToJsonSchema(fieldSchema);
        required.push(key);
      }
    }
    
    return {
      type: SchemaType.OBJECT,
      properties,
      required: required.length > 0 ? required : undefined
    };
  }
  
  if (schema instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(schema.unwrap());
  }
  
  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    if (typeof value === 'string') {
      return { type: SchemaType.STRING, enum: [value] };
    }
  }
  
  if (schema instanceof z.ZodEnum) {
    const values = schema.options;
    return {
      type: SchemaType.STRING,
      enum: values
    };
  }
  
  return { type: SchemaType.STRING };
}

// Test cases
console.log('🧪 Testing Zod to Gemini Schema Conversion\n');

// Test 1: Character extraction schema
const characterSchema = z.object({
  entities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.literal('character'),
    description: z.string().optional()
  }))
});

console.log('1️⃣ Character Schema:');
console.log(JSON.stringify(zodToJsonSchema(characterSchema), null, 2));

// Test 2: Scene extraction schema
const sceneSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    sequence: z.number(),
    summary: z.string(),
    location: z.string().optional().nullable(),
    characters: z.array(z.string()),
    events: z.array(z.object({
      id: z.string(),
      description: z.string(),
      participants: z.array(z.string()),
      sequence: z.number()
    }))
  }))
});

console.log('\n2️⃣ Scene Schema:');
console.log(JSON.stringify(zodToJsonSchema(sceneSchema), null, 2));

// Test 3: Relationship schema
const relationshipSchema = z.object({
  relationships: z.array(z.object({
    source: z.string(),
    target: z.string(),
    type: z.string(),
    description: z.string().optional(),
    firstMentioned: z.number()
  }))
});

console.log('\n3️⃣ Relationship Schema:');
console.log(JSON.stringify(zodToJsonSchema(relationshipSchema), null, 2));

// Test 4: State change schema
const stateChangeSchema = z.object({
  stateChanges: z.array(z.object({
    sceneId: z.string(),
    eventId: z.string().optional(),
    type: z.enum([
      'ownership_transfer',
      'location_change',
      'status_change',
      'relationship_change',
      'entity_transformation',
      'group_formation',
      'group_dissolution'
    ]),
    entities: z.array(z.string()),
    description: z.string(),
    details: z.record(z.any()).optional()
  }))
});

console.log('\n4️⃣ State Change Schema:');
console.log(JSON.stringify(zodToJsonSchema(stateChangeSchema), null, 2));

console.log('\n✅ Schema conversion tests complete!');