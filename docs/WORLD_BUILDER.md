> ⚠️ **SUPERSEDED RELIC** — this doc predates the Narrative Studio and describes an earlier system. Do NOT use it for orientation; start at [`AGENTS.md`](./AGENTS.md) (adjust path from docs/: `../AGENTS.md`).

Ok.  I want to iterate on some UI designs for an app.  Here is the product:
Narrative Studio - Product Specification

  Overview

  Narrative Studio is a conversational world-building and storyboarding tool where users create rich fictional worlds through natural dialogue with an AI collaborator. The AI extracts entities (characters, locations, objects, events), generates visual references, and assembles narrative moments into a visual storyboard—all through a seamless chat experience.

  The underlying infrastructure (knowledge graph, version control, entity relationships) is hidden from the user. They simply talk, create, and watch their story take visual form.

  ---
  Core Philosophy

  - Conversation is creation - Everything happens through natural chat
  - Show, don't manage - The storyboard grows organically; users don't "add panels"
  - Visual grounding - Every entity can have a reference image; every scene pulls from those references
  - Invisible infrastructure - Entity extraction, relationships, and versioning happen silently
  - Focus flows naturally - The AI understands when you're developing an entity vs. writing a scene

  ---
  Primary Interface Components

  1. The Storyboard (Top)

  A horizontal scrolling strip of visual panels representing the narrative sequence.

  Panel States:
  - Empty/Generating - Placeholder while image generates
  - Complete - Image + title + brief prose excerpt
  - Selected - Expanded view with full prose, participating entities
  - Draft - Grayed/outlined, not yet "canon"

  Panel Anatomy:
  ┌─────────────────┐
  │                 │
  │   [Generated    │
  │    Image]       │
  │                 │
  ├─────────────────┤
  │ "The Arrival"   │  ← Auto-generated title
  │ Silas, Ashwood  │  ← Participating entities (small avatars)
  └─────────────────┘

  Interactions:
  - Click panel → Expands to show full prose, all participants, options to regenerate image or edit
  - Hover between panels → Shows subtle [+] insert button
  - Drag panels → Reorder sequence
  - Right-click/long-press → Context menu (delete, regenerate, insert before/after, mark as draft)
  - Scroll → Horizontal scroll through story, or click-drag the strip

  Panel Insertion Flow:
  When user says "let's go back and show what happened before X", the AI:
  1. Identifies where in sequence this belongs
  2. Creates new panel at that position
  3. Other panels shift right

  ---
  2. The Chat (Center/Main)

  The primary interaction space. A conversational interface where all creation happens.

  Message Types:

  | Type           | Appearance                              | Trigger                                                 |
  |----------------|-----------------------------------------|---------------------------------------------------------|
  | User message   | Right-aligned bubble                    | User types                                              |
  | AI narrative   | Left-aligned, prose styling             | AI writes story content                                 |
  | AI brainstorm  | Left-aligned, lighter style             | AI suggests ideas, asks questions                       |
  | Entity focus   | Special card with image gen options     | User says "focus on X" or AI detects entity development |
  | Scene creation | Prose + "Added to storyboard" indicator | AI writes a scene                                       |
  | System         | Subtle, centered                        | Checkpoints, saves, etc.                                |

  Inline Entity Proposals:
  When the AI extracts new entities from conversation, they appear inline:
  ┌─────────────────────────────────────────────────┐
  │ AI: "Silas adjusted his worn leather satchel,   │
  │ the contents clinking softly—vials of rare      │
  │ tinctures from the northern markets..."         │
  │                                                 │
  │ ┌─ New Elements ─────────────────────────────┐  │
  │ │ [+] Silas (character)                      │  │
  │ │ [+] Leather Satchel (object)               │  │
  │ │ [+] Northern Markets (location)            │  │
  │ │                      [Accept All] [Ignore] │  │
  │ └────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────┘

  Entity Focus Mode:
  When developing a specific entity (appearance, backstory, etc.), the chat enters a subtle "focus mode":
  ┌─────────────────────────────────────────────────┐
  │ 🎯 Focusing on: Silas                           │
  ├─────────────────────────────────────────────────┤
  │ You: "What does Silas look like?"               │
  │                                                 │
  │ AI: "Silas is weathered but sharp-eyed, in his  │
  │ late fifties. A long gray traveling coat hangs  │
  │ from narrow shoulders. His hands are stained    │
  │ with herb residue, nails perpetually dirty..."  │
  │                                                 │
  │ ┌─ Generate Reference ───────────────────────┐  │
  │ │ [Generate Image]  [Generate 4 Variations]  │  │
  │ └────────────────────────────────────────────┘  │
  │                                                 │
  │ You: "Make him younger, maybe 40s, with a scar" │
  │                                                 │
  │ AI: [updates description]                       │
  │ [Generate Image] [Generate 4 Variations]        │
  │                                                 │
  │ [Exit Focus] ← returns to general chat          │
  └─────────────────────────────────────────────────┘

  Image Selection Flow:
  When generating entity references:
  ┌─────────────────────────────────────────────────┐
  │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                 │
  │ │ A   │ │ B   │ │ C   │ │ D   │                 │
  │ │     │ │     │ │     │ │     │                 │
  │ └─────┘ └─────┘ └─────┘ └─────┘                 │
  │ [Use A] [Use B] [Use C] [Use D]                 │
  │                                                 │
  │ [Regenerate All] [Describe changes...]          │
  └─────────────────────────────────────────────────┘

  Once selected, the image becomes that entity's canonical reference, used in all future scene generations.

  ---
  3. The World Sidebar (Right, Collapsible)

  A subtle, minimal sidebar showing what exists in the world.

  Default State (Collapsed):
  Just a small icon/button indicating the world exists.

  Expanded State:
  ┌─ World ─────────────────┐
  │ 🔍 [Search...]          │
  │                         │
  │ CHARACTERS              │
  │ ┌─────┬───────────────┐ │
  │ │[img]│ Silas         │ │
  │ │     │ Merchant      │ │
  │ └─────┴───────────────┘ │
  │ ┌─────┬───────────────┐ │
  │ │[img]│ Mira          │ │
  │ │     │ Herbalist     │ │
  │ └─────┴───────────────┘ │
  │                         │
  │ LOCATIONS               │
  │ • Ashwood Village       │
  │ • The Northern Markets  │
  │ • Thornwood Estate      │
  │                         │
  │ OBJECTS                 │
  │ • Leather Satchel       │
  │ • Cursed Amulet         │
  │                         │
  │ [+ Add manually]        │
  └─────────────────────────┘

  Interactions:
  - Click entity → Opens entity detail panel OR enters focus mode in chat
  - Click entity image → View full size, option to regenerate
  - Drag entity to chat → Inserts mention, helps AI know to include it
  - Search → Filter entities by name or type

  ---
  4. Entity Detail Panel (Overlay/Modal)

  When clicking an entity for details (not focus mode):

  ┌─────────────────────────────────────────────────────────┐
  │ ┌───────────┐                                    [X]    │
  │ │           │  SILAS                                    │
  │ │  [image]  │  Wandering Merchant                       │
  │ │           │  ─────────────────────────────────────    │
  │ └───────────┘  "A weathered trader of rare goods,       │
  │                traveling between villages with secrets   │
  │                as valuable as his wares."               │
  │                                                         │
  │ ┌─ Details ───────────────────────────────────────────┐ │
  │ │ Traits: Cautious, Observant, Haunted by past        │ │
  │ │ Motivation: Seeking redemption for a past betrayal  │ │
  │ │ Secret: Knows the true heir to Thornwood            │ │
  │ │ Status: Traveling to Ashwood Village                │ │
  │ └─────────────────────────────────────────────────────┘ │
  │                                                         │
  │ ┌─ Connections ───────────────────────────────────────┐ │
  │ │ → knows secretly: Mira (she is his daughter)        │ │
  │ │ → traveling to: Ashwood Village                     │ │
  │ │ → carries: Leather Satchel, Cursed Amulet           │ │
  │ └─────────────────────────────────────────────────────┘ │
  │                                                         │
  │ ┌─ Appears In ────────────────────────────────────────┐ │
  │ │ [panel1] "The Arrival"                              │ │
  │ │ [panel3] "The Revelation"                           │ │
  │ └─────────────────────────────────────────────────────┘ │
  │                                                         │
  │ [Focus on Silas] [Regenerate Portrait] [Edit Manually]  │
  └─────────────────────────────────────────────────────────┘

  ---
  5. Storyboard Panel Expanded View

  When clicking a storyboard panel:

  ┌─────────────────────────────────────────────────────────────────┐
  │ ◀ Previous                              Next ▶           [X]    │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                 │
  │  ┌─────────────────────────────────┐                            │
  │  │                                 │    "THE ARRIVAL"           │
  │  │                                 │    ───────────────         │
  │  │      [Panel Image]              │    The village emerged     │
  │  │      (large view)               │    from the mist like a    │
  │  │                                 │    memory half-forgotten.  │
  │  │                                 │    Silas paused at the     │
  │  └─────────────────────────────────┘    boundary marker...      │
  │                                                                 │
  │                                         [Read full prose ↓]     │
  │                                                                 │
  │  ┌─ Participants ──────────────────────────────────────────┐    │
  │  │ [Silas img] Silas    [Village img] Ashwood Village      │    │
  │  │                      [Amulet img] Cursed Amulet         │    │
  │  └─────────────────────────────────────────────────────────┘    │
  │                                                                 │
  │  ┌─ Events ────────────────────────────────────────────────┐    │
  │  │ ⚡ Silas arrives at Ashwood Village                      │    │
  │  │ ⚡ Silas senses the curse                                │    │
  │  └─────────────────────────────────────────────────────────┘    │
  │                                                                 │
  │  [Regenerate Image] [Edit Prose] [Insert Panel After] [Delete]  │
  └─────────────────────────────────────────────────────────────────┘

  ---
  Core User Flows

  Flow 1: Starting a New World

  1. User arrives at empty studio
  2. Welcome state shows prompt suggestions:
    - "Tell me about a world you want to create..."
    - "Start with a character"
    - "Begin with a place"
    - "I have a story idea"
  3. User types naturally: "I want to create a dark fantasy world with a wandering merchant who carries cursed objects"
  4. AI responds with narrative prose, introducing initial elements
  5. Entity proposals appear inline (Merchant character, Cursed Objects concept)
  6. User accepts, entities appear in sidebar
  7. AI asks: "Would you like to focus on the merchant first, or explore the world they travel through?"

  ---
  Flow 2: Developing an Entity (Focus Mode)

  1. User: "Let's focus on the merchant - his name is Silas"
  2. AI enters focus mode (subtle UI indicator)
  3. AI elaborates on Silas: description, personality, background
  4. User refines: "Make him older, more weathered, with a mysterious past"
  5. AI updates description
  6. Generate Reference buttons appear
  7. User clicks [Generate 4 Variations]
  8. 4 portrait images appear
  9. User: "I like B but make his coat darker"
  10. AI regenerates with adjustment
  11. User selects final image → Silas now has canonical reference
  12. User: "Let's get back to the story" → exits focus mode

  ---
  Flow 3: Writing a Scene (Storyboard Creation)

  1. User: "Write a scene where Silas arrives at a cursed village"
  2. AI writes narrative prose (several paragraphs)
  3. New entities extracted: "Ashwood Village"
  4. Inline proposal appears, user accepts
  5. "Added to storyboard" indicator appears
  6. New panel appears in storyboard strip with:
    - Generating... placeholder
    - Title: "The Arrival" (auto-generated)
    - Participants: Silas, Ashwood Village
  7. Image generates using Silas's reference + village description
  8. Panel complete, visible in storyboard

  ---
  Flow 4: Inserting a Flashback/Prequel Scene

  1. User: "Actually, let's go back - show me why Silas left the Northern Markets in the first place"
  2. AI recognizes this is a prequel to existing content
  3. AI writes the scene
  4. New panel created and inserted at position 0 (before "The Arrival")
  5. Existing panels shift right
  6. Image generates for new panel
  7. Storyboard now shows narrative in correct chronological order

  ---
  Flow 5: Brainstorming (No Storyboard Output)

  1. User: "What are some ideas for why the village might be cursed?"
  2. AI responds with suggestions (bulleted or prose)
  3. No panel created - AI detects this is ideation, not narrative
  4. User: "I like the idea of a betrayed spirit. Tell me more"
  5. AI elaborates on the concept
  6. User: "Okay, let's make that canon - write the scene of the original betrayal"
  7. Now AI writes narrative prose → panel created

  ---
  Flow 6: Regenerating a Panel Image

  1. User clicks a storyboard panel
  2. Expanded view opens
  3. User clicks [Regenerate Image]
  4. Options appear:
    - "Regenerate with same prompt"
    - "Adjust composition..." (opens refinement chat)
  5. New image generates
  6. User can compare old vs new, choose to keep

  ---
  Flow 7: Viewing/Navigating the Storyboard

  1. User scrolls horizontally through panels
  2. Sees the visual story at a glance
  3. Clicks a panel to expand and read full prose
  4. Uses ◀ ▶ arrows to navigate between panels in expanded view
  5. Notices a gap in the story
  6. Hovers between panels, clicks [+]
  7. Insert mode: "What happens between these moments?"
  8. User describes, AI generates connecting scene

  ---
  Flow 8: Exploring Entity Connections

  1. User clicks "Silas" in sidebar
  2. Entity detail panel opens
  3. User sees Silas's connections:
    - "→ knows secretly: Mira (she is his daughter)"
  4. User clicks "Mira"
  5. Mira's detail panel opens
  6. User: "Wait, Silas has a daughter? Let's explore that"
  7. Clicks [Focus on Mira] → enters focus mode in chat

  ---
  Flow 9: Saving/Checkpoints

  Automatic:
  - World state saves continuously in background
  - User never loses work

  Explicit Checkpoints:
  - User can say "Save this as a checkpoint" or click save icon
  - Creates named checkpoint: "Checkpoint: After the betrayal scene"
  - Can restore to checkpoints if they want to explore alternate directions

  Branching (Advanced, Optional):
  - "Let's try a different version where Silas is the villain"
  - Creates a branch (hidden complexity, just shown as "Alternative: Villain Silas")
  - User can switch between story versions

  ---
  AI Detection Logic

  The AI determines response type based on user intent:

  | User Says                  | AI Detects         | Result                                |
  |----------------------------|--------------------|---------------------------------------|
  | "Write a scene where..."   | Scene request      | Creates storyboard panel              |
  | "Show me when..."          | Scene request      | Creates storyboard panel              |
  | "What happens next?"       | Continue narrative | Creates storyboard panel              |
  | "Let's focus on X"         | Entity development | Enters focus mode                     |
  | "What does X look like?"   | Entity development | Enters focus mode + image gen         |
  | "Tell me more about X"     | Could be either    | AI asks or infers from context        |
  | "What if..."               | Brainstorming      | No panel, just discussion             |
  | "Give me ideas for..."     | Brainstorming      | No panel, just discussion             |
  | "Actually, before that..." | Insert/prequel     | Panel inserted at correct position    |
  | "Let's go back to..."      | Context shift      | May enter focus or continue narrative |

  ---
  Image Generation System

  Entity References

  - Generated during focus mode
  - Stored as canonical reference for that entity
  - Used as input for all scene generation containing that entity
  - Can be regenerated/updated at any time

  Scene/Panel Images

  - Generated automatically when a scene is written
  - Pulls references from all participating entities
  - Composition prompt built from:
    - Scene prose/description
    - Entity visual references
    - Entity current states (if Silas is "wounded", show that)
    - Mood/atmosphere from narrative
  - Can be regenerated with adjustments

  Image Generation UI States

  1. Idle - No generation happening
  2. Generating - Spinner/progress indicator
  3. Selection - Multiple options to choose from
  4. Complete - Final image displayed
  5. Error - Generation failed, retry option

  ---
  Data Model (Hidden from User)

  World
  ├── Entities[]
  │   ├── id, name, type
  │   ├── description, backstory, traits, etc.
  │   ├── referenceImage (URL)
  │   ├── visualDescription (text prompt)
  │   └── currentState (status, location, etc.)
  │
  ├── Relationships[]
  │   ├── source, target, type
  │   └── description (flavor text)
  │
  ├── StoryboardPanels[]
  │   ├── id, position (order)
  │   ├── title
  │   ├── prose (full narrative text)
  │   ├── image (URL)
  │   ├── participants[] (entity IDs)
  │   ├── events[] (extracted events)
  │   └── status (draft, canon)
  │
  ├── Checkpoints[]
  │   ├── id, name, timestamp
  │   └── snapshot of world state
  │
  └── ConversationHistory[]
      └── messages for context continuity

  ---
  Visual Design Notes

  Overall Aesthetic

  - Dark theme (creative tool, easy on eyes for long sessions)
  - Cinematic feel - the storyboard should feel like film production
  - Subtle, not cluttered - complexity hidden until needed
  - Focus on the content (images, prose) not the UI

  Key Visual Elements

  - Storyboard panels should have subtle film-strip or comic-panel aesthetic
  - Entity avatars are circular with subtle border indicating type (character=blue, location=green, object=amber)
  - Chat messages should feel like a creative conversation, not a tech interface
  - Generated images should be prominent - they're the primary output

  Responsive Considerations

  - Desktop: Horizontal storyboard on top, chat below, sidebar right
  - Tablet: Storyboard collapsible to top bar, chat full width, sidebar as overlay
  - Mobile: Tab-based (Storyboard | Chat | World), one view at a time

  ---
  Edge Cases & States

  Empty States

  - New world: Welcoming prompt, suggestions to start
  - No storyboard panels: "Your story will appear here as you write"
  - No entity image: Placeholder silhouette with "Generate portrait" button

  Error States

  - Image generation fails: Show error, offer retry, allow skip
  - AI request fails: Show error inline, offer retry
  - Save fails: Show warning, auto-retry, never lose data

  Loading States

  - AI thinking: Typing indicator in chat
  - Image generating: Spinner on panel, progress bar if available
  - World loading: Skeleton UI for storyboard and sidebar

  ---
  Future Possibilities (Not for V1)

  - Export: Export storyboard as PDF, image sequence, or video
  - Collaboration: Multiple users building same world
  - Voice input: Speak to create
  - Animation: Subtle panel animations, transitions
  - Music/Mood: Generate ambient audio for scenes
  - Branching narratives: Explicit support for multiple story paths
  - Publishing: Share worlds publicly, let others explore

  ---
  This should give a designer everything they need to create UI mockups. Want me to adjust any section or add more detail to specific flows?

Lets make sure you understand it before we generate images.  Any questions?
