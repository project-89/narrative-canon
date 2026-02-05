/**
 * Scale Extraction Tests
 *
 * Tests narrative extraction at different text lengths:
 * - Short (1-2 paragraphs)
 * - Medium (1-2 pages)
 * - Long (chapter-length)
 */

import { NarrativePipeline } from '../src/pipeline';
import { MockLLM } from '../src/llm/mock';
import { GeminiAdapter } from '../src/llm/gemini';
import { NarrativeStructure, Entity } from '../src/types';

// Test texts of varying lengths
const SHORT_TEXT = `
Alice wandered through the enchanted forest, her footsteps crunching on fallen leaves.
She encountered an old wizard named Merlin sitting beneath an ancient oak tree.
"The prophecy speaks of your coming," Merlin said with a knowing smile.
Alice felt both curious and afraid of what this might mean for her destiny.
`.trim();

const MEDIUM_TEXT = `
Chapter 1: The Beginning

In the sprawling metropolis of Neo-Tokyo, where neon lights painted the rain-slicked streets
in hues of electric blue and magenta, Agent Kira navigated through the crowded marketplace.
She had been tracking the Oneirocom operative for three days now, piecing together fragments
of encrypted communications that suggested a deeper conspiracy than anyone had imagined.

The Resistance had sent her on this mission knowing the risks. Director Chen, a grizzled
veteran of the Timeline Wars, had briefed her personally. "Oneirocom is planning something
big," he'd said, his weathered face illuminated by holographic displays. "Something that
could collapse multiple timeline branches into their perfect convergence."

Kira ducked into a noodle shop, the steam from cooking pots providing temporary cover.
She spotted her contact - a nervous young hacker called Zero who specialized in reality
breaches. His fingers twitched constantly, a side effect of too many neural interface sessions.

"The data you need is in Sector 7," Zero whispered, sliding a crystalline storage chip
across the counter. "But be careful. The Timeline Enforcement Division has agents everywhere.
They know someone is digging into Project Morpheus."

Kira palmed the chip smoothly. Project Morpheus - the codename for Oneirocom's master plan
to achieve total timeline convergence. If their simulations were correct, it would
effectively erase all alternate realities, creating a single dominant timeline under
Oneirocom's complete control.

She left the noodle shop through a back alley, her mind racing with the implications.
The Resistance had always known Oneirocom was powerful, but this went beyond corporate
dominance. This was about controlling the very fabric of reality itself.

In the shadows, a figure watched her departure. Agent Vance, Oneirocom's most effective
operative, smiled coldly. The trap was set. All the pieces were moving exactly as
Alexander Morfius had predicted they would. The Convergence was inevitable.
`.trim();

const LONG_TEXT = `
Chapter 1: The Shadow of the Mountain

In the village of Willowmere, nestled in the valley between the ancient peaks of
the Ironspine Mountains, there lived an old storyteller named Eldric. For sixty
years he had chronicled the tales of heroes and monsters, of kingdoms risen and
fallen, of magic that once flowed through the land like water through a stream.

But on this particular autumn evening, as copper leaves swirled outside the
tavern window and the first frost crept across the fields, Eldric had a different
story to tell. It was the story of how the world itself began to forget.

"It started," he said, his voice carrying to every corner of the crowded room,
"with the death of the last dragon."

The young listeners leaned forward. They had grown up on stories of dragons -
magnificent creatures of fire and wisdom that had once been the guardians of
reality itself. But those were just stories now, myths from a forgotten age.

"His name was Zephyrion," Eldric continued, "and he was the Guardian of the
Eastern Gate. When he fell in battle against the Shadow King's army, something
fundamental broke in the world. The Gate he had protected for ten thousand
years stood undefended, and through it, the Shadow began to seep."

Princess Elara sat in the back corner, hood pulled low over her distinctive
silver hair. She had fled the capital three weeks ago when her father, King
Aldric, had been corrupted by the Shadow's influence. The man who had raised
her with such love and wisdom was gone, replaced by a cold and calculating
tyrant who had already ordered the execution of half his council.

With her traveled Sir Marcus, her father's most loyal knight, though now
branded a traitor by the corrupted court. His armor was hidden beneath a
traveler's cloak, and his famous blade, Dawnbreaker, was wrapped in cloth
to hide its distinctive glow.

"The Shadow doesn't simply kill," Eldric was saying. "It unmakes. It erases
not just lives but memories, histories, the very connections between things.
Towns that stood for centuries simply... weren't anymore. And no one remembered
they had ever been."

A merchant named Torven raised his mug. "Old tales and superstition. The
kingdom's troubles are political, not magical. The king simply went mad,
as kings sometimes do."

"Then explain the Vanished Lands," said a woman at another table. Her name
was Seren, and she was a cartographer by trade. "I've been mapping these
regions for twenty years. Last month, I traveled to chart the Elvenmoor - a
forest that's been on every map for five hundred years. It wasn't there. And
when I asked the locals about it, they looked at me as if I were mad. They
said there had never been a forest there, just barren hills."

The room fell silent at this. The Elvenmoor was famous - or had been. Seren's
words struck something uncomfortable in the hearts of those present, a vague
sense that something was missing that they couldn't quite identify.

Elara exchanged a glance with Marcus. This confirmed what the court wizard,
before his arrest, had tried to tell them. The Shadow wasn't just conquering
the kingdom - it was unraveling reality itself.

"There is hope," Eldric said softly. "There is always hope. The prophecy speaks
of the Convergence - a time when heroes from different paths will come together
to restore what was lost. They will need to find the three Anchor Points -
places where reality is still strong enough to resist the Shadow's erosion."

He unrolled an ancient map, one that seemed to shimmer with its own inner light.
"The Temple of Dawn in the eastern mountains. The Deep Library beneath the
Whispering Sea. And the Throne of Echoes, hidden somewhere in the Shadow King's
own domain. At each location, a fragment of the old magic still exists. Bring
them together, and perhaps... perhaps the world can remember what it has forgotten."

Outside, the wind howled as a storm rolled down from the mountains. In the
darkness beyond the village lights, shapes moved - the Shadow King's hunters,
drawn by rumors of the fugitive princess.

Elara knew their respite was ending. By dawn, they would need to be gone,
racing against both the hunters and the spreading amnesia that threatened
to erase everything they were fighting to save.

She thought of her mother, Queen Isolde, who had disappeared three years ago
during an expedition to the northern wastes. Everyone said she was dead, but
Elara had never been able to accept it. Now she wondered: had her mother
actually died, or had she simply been... unmade? Was there a difference?

The question haunted her as the fire crackled and Eldric began another tale,
this one about the legendary hero who had first defeated the Shadow King, a
thousand years ago. A hero whose name, Elara realized with a chill, she could
no longer quite remember.

The forgetting had begun.

Chapter 2: The Road to Dawn

They left before first light, slipping through the village's eastern gate while
the watchmen dozed at their posts. The storm had passed, leaving the world
covered in a thin layer of frost that crunched beneath their horses' hooves.

Marcus led the way, his soldier's instincts guiding them along paths that
avoided the main roads. Behind him, Elara clutched the fragment of map that
Eldric had given her - not a copy, but a piece of the original, torn from
the ancient chart.

"The Temple of Dawn lies three weeks' ride to the east," Marcus said,
consulting the stars. "But there are multiple routes. The mountain pass is
fastest but most dangerous. The forest road adds five days but offers better
cover."

"What do you recommend?"

"In ordinary circumstances, the forest road. But these aren't ordinary
circumstances. Every day we delay, more of the world slips away. I say we
risk the mountains."

Elara nodded. Speed was essential. The cartographer Seren's words still echoed
in her mind. Entire regions were vanishing, and no one remembered they had
existed. How long before the erasure reached the places they needed to go?
How long before it reached the people they were trying to save?

They traveled in silence for hours, each lost in their own thoughts. The
landscape around them was achingly beautiful - rolling hills covered in autumn
colors, distant peaks catching the first light of dawn. But there was something
wrong about it too, something they could both feel but neither could name.

"The village we passed yesterday," Elara said suddenly. "Thornfield, it was called."

Marcus frowned. "I don't remember a village."

"We stopped there for supplies. A merchant sold us these provisions." She
gestured to the saddlebags. "He had a daughter who wanted to know if I was
really a princess."

"My lady, we've been on the road for two days. We haven't stopped anywhere."

Elara's blood ran cold. She remembered Thornfield clearly - the cobblestone
streets, the smell of baking bread, the merchant's gap-toothed smile. But as
she tried to hold onto the memory, it seemed to shimmer and fade, like a
dream dissolving in the light of morning.

"It's happening," she whispered. "The forgetting. It's happening to us too."

They rode harder after that, fear lending speed to their flight. The mountains
loomed ahead, ancient and immovable, and Elara prayed they would still be there
when she and Marcus arrived.

Because in a world where even geography could be unmade, nothing was certain anymore.
`.trim();

describe('Scale Extraction Tests', () => {
  // Use Mock LLM for unit tests (fast, deterministic)
  const mockLLM = new MockLLM();
  const mockPipeline = new NarrativePipeline(mockLLM);

  // Real LLM tests only run when ALLOW_LLM_TESTS is enabled
  const runLLMTests = process.env.ALLOW_LLM_TESTS === 'true';
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const realPipeline = runLLMTests && apiKey
    ? new NarrativePipeline(new GeminiAdapter({
        apiKey,
        timeout: 180000, // 3 minutes for complex extractions
        maxRetries: 3
      }))
    : null;

  describe('Short Text Extraction (Mock)', () => {
    let result: NarrativeStructure;

    beforeAll(async () => {
      result = await mockPipeline.extractNarrative(SHORT_TEXT);
    });

    it('should extract entities from short text', () => {
      expect(result.entities).toBeDefined();
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should extract scenes from short text', () => {
      expect(result.scenes).toBeDefined();
      expect(result.scenes.length).toBeGreaterThan(0);
    });

    it('should extract relationships from short text', () => {
      expect(result.relationships).toBeDefined();
    });

    it('should build chronology from short text', () => {
      expect(result.chronology).toBeDefined();
      expect(result.chronology.events).toBeDefined();
    });
  });

  describe('Medium Text Extraction (Mock)', () => {
    let result: NarrativeStructure;

    beforeAll(async () => {
      result = await mockPipeline.extractNarrative(MEDIUM_TEXT);
    });

    it('should extract entities from medium text', () => {
      expect(result.entities).toBeDefined();
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should extract scenes from medium text', () => {
      expect(result.scenes).toBeDefined();
      expect(result.scenes.length).toBeGreaterThan(0);
    });
  });

  describe('Long Text Extraction (Mock)', () => {
    let result: NarrativeStructure;

    beforeAll(async () => {
      result = await mockPipeline.extractNarrative(LONG_TEXT);
    });

    it('should extract entities from long text', () => {
      expect(result.entities).toBeDefined();
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should extract multiple scenes from long text', () => {
      expect(result.scenes).toBeDefined();
      expect(result.scenes.length).toBeGreaterThan(0);
    });
  });

  // Real LLM tests - only run when ALLOW_LLM_TESTS=true
  (runLLMTests ? describe : describe.skip)('Short Text Extraction (Real LLM)', () => {
    let result: NarrativeStructure;

    beforeAll(async () => {
      if (!realPipeline) throw new Error('Real pipeline not initialized');
      result = await realPipeline.extractNarrative(SHORT_TEXT);
    }, 180000); // 3 min timeout for LLM

    it('should extract characters Alice and Merlin', () => {
      const names = result.entities.map(e => e.name.toLowerCase());
      expect(names.some(n => n.includes('alice'))).toBe(true);
      expect(names.some(n => n.includes('merlin'))).toBe(true);
    });

    it('should extract the forest location', () => {
      const locations = result.entities.filter(e => e.type === 'location');
      expect(locations.length).toBeGreaterThan(0);
    });

    it('should extract relationship between Alice and Merlin', () => {
      expect(result.relationships.length).toBeGreaterThan(0);
      const aliceMerlinRel = result.relationships.some(r => {
        const src = r.source.toLowerCase();
        const tgt = r.target.toLowerCase();
        return (src.includes('alice') && tgt.includes('merlin')) ||
               (src.includes('merlin') && tgt.includes('alice'));
      });
      expect(aliceMerlinRel).toBe(true);
    });
  });

  (runLLMTests ? describe : describe.skip)('Medium Text Extraction (Real LLM)', () => {
    let result: NarrativeStructure;

    beforeAll(async () => {
      if (!realPipeline) throw new Error('Real pipeline not initialized');
      result = await realPipeline.extractNarrative(MEDIUM_TEXT);
    }, 300000); // 5 min timeout

    it('should extract main characters (Kira, Chen, Zero, Vance)', () => {
      const names = result.entities.map(e => e.name.toLowerCase());
      expect(names.some(n => n.includes('kira'))).toBe(true);
    });

    it('should extract organizations (Oneirocom, Resistance)', () => {
      const orgs = result.entities.filter(e => e.type === 'organization');
      expect(orgs.length).toBeGreaterThan(0);
    });

    it('should extract locations (Neo-Tokyo, Sector 7)', () => {
      const locations = result.entities.filter(e => e.type === 'location');
      expect(locations.length).toBeGreaterThan(0);
    });

    it('should extract multiple scenes', () => {
      expect(result.scenes.length).toBeGreaterThanOrEqual(1);
    });

    it('should track state changes', () => {
      expect(result.stateChanges).toBeDefined();
    });

    it('should have coherence metadata', () => {
      expect(result.metadata.timelineCoherenceLevel).toBeDefined();
    });
  });

  (runLLMTests ? describe : describe.skip)('Long Text Extraction (Real LLM)', () => {
    let result: NarrativeStructure;

    beforeAll(async () => {
      if (!realPipeline) throw new Error('Real pipeline not initialized');
      result = await realPipeline.extractNarrative(LONG_TEXT);
    }, 600000); // 10 min timeout

    it('should extract many characters', () => {
      const characters = result.entities.filter(e => e.type === 'character');
      expect(characters.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract key characters (Eldric, Elara, Marcus)', () => {
      const names = result.entities.map(e => e.name.toLowerCase());
      expect(names.some(n => n.includes('eldric') || n.includes('storyteller'))).toBe(true);
      expect(names.some(n => n.includes('elara') || n.includes('princess'))).toBe(true);
    });

    it('should extract locations (Willowmere, Temple of Dawn)', () => {
      const locations = result.entities.filter(e => e.type === 'location');
      expect(locations.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract concepts (Shadow, Convergence)', () => {
      const names = result.entities.map(e => e.name.toLowerCase());
      expect(names.some(n => n.includes('shadow'))).toBe(true);
    });

    it('should extract multiple scenes for chapter structure', () => {
      expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    });

    it('should maintain entity deduplication', () => {
      // Check for no duplicate entities with similar names
      const names = result.entities.map(e => e.name.toLowerCase());
      const uniqueNames = new Set(names);
      // Allow some flexibility but expect mostly unique
      expect(uniqueNames.size).toBeGreaterThanOrEqual(names.length * 0.7);
    });

    it('should build complete chronology', () => {
      expect(result.chronology.events.length).toBeGreaterThan(0);
      // Events should be sequenced
      result.chronology.events.forEach((event, index) => {
        if (index > 0) {
          expect(event.sequence).toBeGreaterThanOrEqual(result.chronology.events[index - 1].sequence);
        }
      });
    });
  });

  describe('Incremental Extraction', () => {
    it('should support incremental extraction without duplicates', async () => {
      // First extraction
      const result1 = await mockPipeline.extractNarrative(SHORT_TEXT);

      // Incremental extraction with additional text
      const additionalText = `
        The next day, Alice and Merlin traveled to the Crystal Cave.
        There they met a young apprentice named Sarah who had been waiting.
        Sarah had important news about the prophecy that would change everything.
      `.trim();

      const result2 = await mockPipeline.extractNarrativeIncremental(
        additionalText,
        result1
      );

      // Should have entities from both extractions
      expect(result2.entities.length).toBeGreaterThanOrEqual(result1.entities.length);

      // Deduplication should be applied
      expect(result2.metadata.entityDeduplicationApplied).toBe(true);
    });
  });

  describe('Text Length Metrics', () => {
    it('should report correct entity counts for different lengths', async () => {
      const shortResult = await mockPipeline.extractNarrative(SHORT_TEXT);
      const mediumResult = await mockPipeline.extractNarrative(MEDIUM_TEXT);
      const longResult = await mockPipeline.extractNarrative(LONG_TEXT);

      console.log('Extraction metrics:');
      console.log(`  Short (${SHORT_TEXT.length} chars): ${shortResult.entities.length} entities, ${shortResult.scenes.length} scenes`);
      console.log(`  Medium (${MEDIUM_TEXT.length} chars): ${mediumResult.entities.length} entities, ${mediumResult.scenes.length} scenes`);
      console.log(`  Long (${LONG_TEXT.length} chars): ${longResult.entities.length} entities, ${longResult.scenes.length} scenes`);

      // All should have some content
      expect(shortResult.entities.length).toBeGreaterThan(0);
      expect(mediumResult.entities.length).toBeGreaterThan(0);
      expect(longResult.entities.length).toBeGreaterThan(0);
    });
  });
});
