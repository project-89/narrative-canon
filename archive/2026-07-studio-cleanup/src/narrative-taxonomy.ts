// Comprehensive Narrative Taxonomy
// Based on narrative analysis, literary theory, and story structure

export enum EntityType {
  // Characters
  CHARACTER = 'character',
  PROTAGONIST = 'protagonist', 
  ANTAGONIST = 'antagonist',
  SUPPORTING_CHARACTER = 'supporting_character',
  NARRATOR = 'narrator',
  
  // Locations & Settings
  LOCATION = 'location',
  BUILDING = 'building',
  ROOM = 'room',
  NATURAL_LOCATION = 'natural_location',
  IMAGINARY_PLACE = 'imaginary_place',
  
  // Objects & Items
  OBJECT = 'object',
  WEAPON = 'weapon',
  BOOK = 'book',
  VEHICLE = 'vehicle',
  MAGICAL_ITEM = 'magical_item',
  TOOL = 'tool',
  
  // Organizations & Groups
  ORGANIZATION = 'organization',
  FAMILY = 'family',
  GOVERNMENT = 'government',
  ARMY = 'army',
  GUILD = 'guild',
  
  // Abstract Concepts
  CONCEPT = 'concept',
  EMOTION = 'emotion',
  IDEA = 'idea',
  FORCE = 'force',
  POWER = 'power',
  
  // Events & Phenomena
  EVENT = 'event',
  DISASTER = 'disaster',
  CEREMONY = 'ceremony',
  BATTLE = 'battle'
}

export enum RelationshipType {
  // Social Relationships
  FAMILY = 'family',              // parent, child, sibling, spouse
  FRIENDSHIP = 'friendship',       // friends, allies, companions
  ROMANTIC = 'romantic',          // lovers, romantic interest
  PROFESSIONAL = 'professional',  // boss, employee, colleague
  ENEMY = 'enemy',                // antagonist, rival, opponent
  MENTOR = 'mentor',              // teacher, guide, master
  
  // Possession & Ownership
  OWNS = 'owns',                  // character owns object
  CARRIES = 'carries',            // character carries object
  CREATED = 'created',            // character created object
  CONTROLS = 'controls',          // character controls force/power
  
  // Location Relationships
  LIVES_IN = 'lives_in',          // character lives in location
  VISITS = 'visits',              // character visits location  
  RULES = 'rules',                // character rules location
  BELONGS_TO = 'belongs_to',      // object belongs to location
  CONTAINS = 'contains',          // location contains object/character
  
  // Knowledge & Information
  KNOWS_ABOUT = 'knows_about',    // character knows about concept
  SEEKS = 'seeks',                // character seeks object/person
  FEARS = 'fears',                // character fears entity
  TRUSTS = 'trusts',              // character trusts character
  DISTRUSTS = 'distrusts',        // character distrusts character
  
  // Actions & Effects
  HELPS = 'helps',                // character helps character
  HARMS = 'harms',                // character harms character
  PROTECTS = 'protects',          // character protects entity
  SERVES = 'serves',              // character serves organization/character
  FOLLOWS = 'follows',            // character follows character
  LEADS = 'leads',                // character leads group
  
  // Magical/Supernatural
  ENCHANTED_BY = 'enchanted_by',  // object enchanted by character
  CURSED_BY = 'cursed_by',        // entity cursed by entity
  SUMMONED_BY = 'summoned_by',    // entity summoned by character
  
  // Generic fallback
  RELATED_TO = 'related_to'       // general relationship
}

export interface NarrativeEntity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  aliases?: string[];
  firstMentioned?: number;
  properties?: {
    isAlive?: boolean;
    isMainCharacter?: boolean;
    alignment?: 'good' | 'neutral' | 'evil';
    species?: string;
    occupation?: string;
    [key: string]: any;
  };
}

export interface NarrativeRelationship {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  description: string;
  strength?: number; // 1-10 scale
  bidirectional?: boolean;
  firstMentioned?: number;
  context?: string; // additional context about the relationship
}

// Relationship inference rules
export const RELATIONSHIP_PATTERNS = {
  // Family patterns
  'parent': RelationshipType.FAMILY,
  'mother': RelationshipType.FAMILY,
  'father': RelationshipType.FAMILY,
  'son': RelationshipType.FAMILY,
  'daughter': RelationshipType.FAMILY,
  'brother': RelationshipType.FAMILY,
  'sister': RelationshipType.FAMILY,
  
  // Professional patterns
  'boss': RelationshipType.PROFESSIONAL,
  'employee': RelationshipType.PROFESSIONAL,
  'teacher': RelationshipType.MENTOR,
  'student': RelationshipType.MENTOR,
  'master': RelationshipType.MENTOR,
  
  // Social patterns
  'friend': RelationshipType.FRIENDSHIP,
  'ally': RelationshipType.FRIENDSHIP,
  'enemy': RelationshipType.ENEMY,
  'rival': RelationshipType.ENEMY,
  'lover': RelationshipType.ROMANTIC,
  
  // Actions indicating relationships
  'helps': RelationshipType.HELPS,
  'attacks': RelationshipType.HARMS,
  'protects': RelationshipType.PROTECTS,
  'leads': RelationshipType.LEADS,
  'follows': RelationshipType.FOLLOWS,
  'owns': RelationshipType.OWNS,
  'carries': RelationshipType.CARRIES,
  'lives in': RelationshipType.LIVES_IN,
  'visits': RelationshipType.VISITS
} as const;

// Entity classification patterns
export const ENTITY_PATTERNS = {
  // Character indicators
  'person': EntityType.CHARACTER,
  'man': EntityType.CHARACTER,
  'woman': EntityType.CHARACTER,
  'child': EntityType.CHARACTER,
  'wizard': EntityType.CHARACTER,
  'king': EntityType.CHARACTER,
  'queen': EntityType.CHARACTER,
  
  // Location indicators
  'forest': EntityType.NATURAL_LOCATION,
  'mountain': EntityType.NATURAL_LOCATION,
  'river': EntityType.NATURAL_LOCATION,
  'castle': EntityType.BUILDING,
  'tower': EntityType.BUILDING,
  'house': EntityType.BUILDING,
  'room': EntityType.ROOM,
  'city': EntityType.LOCATION,
  'village': EntityType.LOCATION,
  
  // Object indicators
  'sword': EntityType.WEAPON,
  'book': EntityType.BOOK,
  'spell': EntityType.MAGICAL_ITEM,
  'ring': EntityType.MAGICAL_ITEM,
  'horse': EntityType.OBJECT, // Could be more specific
  'car': EntityType.VEHICLE
} as const;

export function inferEntityType(name: string, context: string): EntityType {
  const lowerName = name.toLowerCase();
  const lowerContext = context.toLowerCase();
  
  // Check direct patterns
  for (const [pattern, type] of Object.entries(ENTITY_PATTERNS)) {
    if (lowerName.includes(pattern) || lowerContext.includes(pattern)) {
      return type;
    }
  }
  
  // Character heuristics (has dialogue, performs actions)
  if (context.includes('"') || 
      context.includes('said') || 
      context.includes('walked') ||
      context.includes('thought')) {
    return EntityType.CHARACTER;
  }
  
  // Location heuristics (characters go to/from it)
  if (context.includes('went to') ||
      context.includes('arrived at') ||
      context.includes('in the')) {
    return EntityType.LOCATION;
  }
  
  // Default to generic types
  return EntityType.OBJECT;
}

export function inferRelationshipType(
  source: string, 
  target: string, 
  context: string
): RelationshipType {
  const lowerContext = context.toLowerCase();
  
  // Check action patterns
  for (const [pattern, type] of Object.entries(RELATIONSHIP_PATTERNS)) {
    if (lowerContext.includes(pattern)) {
      return type;
    }
  }
  
  // Default fallback
  return RelationshipType.RELATED_TO;
}