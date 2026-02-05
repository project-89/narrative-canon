/**
 * Gemini Debug Tool
 * 
 * This helps us understand exactly what Gemini returns for different
 * prompt and schema combinations.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

export class GeminiDebugger {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private logDir: string;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    this.logDir = path.join(process.cwd(), 'gemini-debug-logs');
  }

  async init() {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  /**
   * Test a specific prompt and log everything
   */
  async testPrompt(
    testName: string,
    prompt: string,
    options: {
      responseMimeType?: string;
      temperature?: number;
      schema?: z.ZodSchema;
    } = {}
  ) {
    console.log(`\n🧪 Testing: ${testName}`);
    console.log('━'.repeat(50));

    const logFile = path.join(this.logDir, `${testName}-${Date.now()}.json`);
    const log: any = {
      testName,
      timestamp: new Date().toISOString(),
      prompt,
      options,
      schemaDescription: options.schema ? this.describeSchema(options.schema) : null
    };

    try {
      // Test 1: Raw response
      console.log('📤 Sending prompt to Gemini...');
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          responseMimeType: options.responseMimeType
        }
      });

      const rawText = result.response.text();
      log.rawResponse = rawText;
      console.log('📥 Raw response:', rawText.substring(0, 200) + '...');

      // Test 2: Try to parse as JSON
      if (options.responseMimeType === 'application/json' || rawText.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawText);
          log.parsedJson = parsed;
          console.log('✅ Parsed as JSON successfully');
          console.log('📊 Structure:', this.describeStructure(parsed));

          // Test 3: Validate against schema if provided
          if (options.schema) {
            try {
              const validated = options.schema.parse(parsed);
              log.validation = { success: true, data: validated };
              console.log('✅ Schema validation passed!');
            } catch (zodError: any) {
              log.validation = { 
                success: false, 
                errors: zodError.errors,
                issues: zodError.issues 
              };
              console.log('❌ Schema validation failed:');
              zodError.errors.forEach((err: any) => {
                console.log(`   - ${err.path.join('.')}: ${err.message}`);
              });
            }
          }
        } catch (parseError: any) {
          log.parseError = parseError.message;
          console.log('❌ Failed to parse as JSON:', parseError.message);
        }
      }

    } catch (error: any) {
      log.error = {
        message: error.message,
        stack: error.stack
      };
      console.log('❌ API Error:', error.message);
    }

    // Save log
    await fs.writeFile(logFile, JSON.stringify(log, null, 2));
    console.log(`💾 Log saved to: ${path.relative(process.cwd(), logFile)}`);

    return log;
  }

  /**
   * Run a series of experiments to understand Gemini's behavior
   */
  async runExperiments() {
    await this.init();

    console.log('🔬 Gemini Structured Output Experiments');
    console.log('=' .repeat(50));

    // Experiment 1: Simple JSON request
    await this.testPrompt('simple-json', 
      'Return a JSON object with name "Alice" and age 25.',
      { responseMimeType: 'application/json' }
    );

    // Experiment 2: Array request
    await this.testPrompt('array-json',
      'Return a JSON object with a key "items" containing an array of 3 objects, each with "id" and "name" fields.',
      { responseMimeType: 'application/json' }
    );

    // Experiment 3: Character extraction with explicit structure
    const characterSchema = z.object({
      entities: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.string()
      }))
    });

    await this.testPrompt('character-explicit',
      `Extract characters from this text and return as JSON:
      
      "Alice met Bob in the park. They discussed the mission with Commander Chen."
      
      You MUST return this exact JSON structure:
      {
        "entities": [
          {"id": "string", "name": "string", "type": "character"}
        ]
      }
      
      Rules:
      - id should be "char_" + lowercase name
      - type must be "character"
      - Include all characters found`,
      { 
        responseMimeType: 'application/json',
        schema: characterSchema
      }
    );

    // Experiment 4: With JSON Schema in prompt
    await this.testPrompt('with-json-schema',
      `Extract characters from: "Alice met Bob in the park."
      
      Return JSON matching this schema:
      {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "required": ["entities"],
        "properties": {
          "entities": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "name", "type"],
              "properties": {
                "id": {"type": "string"},
                "name": {"type": "string"},
                "type": {"type": "string", "const": "character"}
              }
            }
          }
        }
      }`,
      { responseMimeType: 'application/json' }
    );

    // Experiment 5: With example
    await this.testPrompt('with-example',
      `Extract characters from: "Alice met Bob in the park."
      
      Return JSON exactly like this example:
      {
        "entities": [
          {"id": "char_john", "name": "John Smith", "type": "character"},
          {"id": "char_jane", "name": "Jane Doe", "type": "character"}
        ]
      }`,
      { responseMimeType: 'application/json' }
    );

    console.log('\n✅ Experiments complete! Check gemini-debug-logs/ for details.');
  }

  /**
   * Test a specific extractor
   */
  async testExtractor(extractorType: 'character' | 'scene' | 'relationship', text: string) {
    const schemas = {
      character: z.object({
        entities: z.array(z.object({
          id: z.string(),
          name: z.string(),
          type: z.literal('character'),
          description: z.string().optional()
        }))
      }),
      scene: z.object({
        scenes: z.array(z.object({
          id: z.string(),
          sequence: z.number(),
          summary: z.string(),
          location: z.string().optional(),
          characters: z.array(z.string()),
          events: z.array(z.object({
            id: z.string(),
            description: z.string(),
            participants: z.array(z.string()),
            sequence: z.number()
          }))
        }))
      }),
      relationship: z.object({
        relationships: z.array(z.object({
          source: z.string(),
          target: z.string(),
          type: z.string(),
          description: z.string().optional(),
          firstMentioned: z.number()
        }))
      })
    };

    const prompts = {
      character: `Extract all characters from this text: "${text}"
      
Return as JSON with structure: {"entities": [{"id": "char_name", "name": "Name", "type": "character"}]}`,
      
      scene: `Break this text into scenes: "${text}"
      
Return as JSON with structure: {"scenes": [{"id": "scene_1", "sequence": 1, "summary": "...", "characters": [...], "events": [...]}]}`,
      
      relationship: `Extract relationships from this text: "${text}"
      
Return as JSON with structure: {"relationships": [{"source": "Name1", "target": "Name2", "type": "relationship_type", "firstMentioned": 1}]}`
    };

    await this.testPrompt(
      `${extractorType}-extractor-test`,
      prompts[extractorType],
      {
        responseMimeType: 'application/json',
        schema: schemas[extractorType]
      }
    );
  }

  private describeSchema(schema: z.ZodSchema): any {
    // Convert Zod schema to readable description
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const description: any = { type: 'object', properties: {} };
      
      for (const [key, value] of Object.entries(shape)) {
        description.properties[key] = this.describeSchemaType(value as z.ZodSchema);
      }
      
      return description;
    }
    
    return this.describeSchemaType(schema);
  }

  private describeSchemaType(schema: z.ZodSchema): any {
    if (schema instanceof z.ZodString) return { type: 'string' };
    if (schema instanceof z.ZodNumber) return { type: 'number' };
    if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
    if (schema instanceof z.ZodArray) {
      return { 
        type: 'array', 
        items: this.describeSchemaType(schema.element)
      };
    }
    if (schema instanceof z.ZodOptional) {
      return { 
        ...this.describeSchemaType(schema.unwrap()),
        optional: true
      };
    }
    if (schema instanceof z.ZodLiteral) {
      return { type: 'literal', value: schema.value };
    }
    return { type: 'unknown' };
  }

  private describeStructure(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent);
    
    if (Array.isArray(obj)) {
      return `Array[${obj.length}]`;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj);
      return `Object { ${keys.join(', ')} }`;
    }
    
    return typeof obj;
  }
}

// CLI usage
if (require.main === module) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Please set GOOGLE_AI_API_KEY environment variable');
    process.exit(1);
  }

  const debugger = new GeminiDebugger(apiKey);
  
  const command = process.argv[2];
  
  if (command === 'test-extractor') {
    const type = process.argv[3] as any;
    const text = process.argv[4];
    
    if (!type || !text) {
      console.log('Usage: npm run gemini-debug test-extractor <character|scene|relationship> "text"');
      process.exit(1);
    }
    
    debugger.testExtractor(type, text).catch(console.error);
  } else {
    debugger.runExperiments().catch(console.error);
  }
}