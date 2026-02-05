// Demo data for Narrative Studio design testing
// A dark fantasy story about a wanderer named Silas in a cursed village

export interface DemoEntity {
  id: string;
  name: string;
  type: "character" | "location" | "object" | "faction" | "creature" | "concept";
  description: string;
  backstory?: string;
  traits?: string[];
  status?: "canon" | "draft";
  referenceImage?: string;
}

export interface DemoRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  type: string;
  description?: string;
}

export interface DemoScene {
  id: string;
  title: string;
  prose: string;
  imageUrl?: string;
  participantIds: string[];
  locationId?: string;
  events?: string[];
  position: number;
  status: "canon" | "draft";
  frames?: DemoSceneFrame[];
}

export interface DemoSceneFrame {
  id: string;
  position: number;
  title?: string;
  description: string;
  visualBeat?: string;
  participantIds?: string[];
  locationId?: string;
  imageUrl?: string;
  shotType?: string;
  camera?: string;
  mood?: string;
}

// Placeholder images using picsum for demo (fantasy-ish tones)
const IMAGES = {
  silas: "https://picsum.photos/seed/silas/800/800",
  mira: "https://picsum.photos/seed/mira/800/800",
  elder: "https://picsum.photos/seed/elder/800/800",
  shade: "https://picsum.photos/seed/shade/800/800",
  ashwood: "https://picsum.photos/seed/ashwood/800/800",
  tavern: "https://picsum.photos/seed/tavern/800/800",
  ruins: "https://picsum.photos/seed/ruins/800/800",
  amulet: "https://picsum.photos/seed/amulet/800/800",
  tome: "https://picsum.photos/seed/tome/800/800",
  scene1: "https://picsum.photos/seed/arrival/1200/600",
  scene2: "https://picsum.photos/seed/tavern-scene/1200/600",
  scene3: "https://picsum.photos/seed/ruins-scene/1200/600",
  scene4: "https://picsum.photos/seed/ritual/1200/600",
};

export const demoEntities: DemoEntity[] = [
  {
    id: "ent_silas",
    name: "Silas the Wanderer",
    type: "character",
    description: "A weathered traveler with silver-streaked hair and eyes that have seen too many horrors. He carries an ancient burden that draws him to cursed places.",
    backstory: "Once a scholar at the Grand Academy, Silas lost everything when his experiments with forbidden texts released a shadow that consumed his family. Now he wanders, seeking to undo what he unleashed.",
    traits: ["haunted", "knowledgeable", "determined", "secretive"],
    status: "canon",
    referenceImage: IMAGES.silas,
  },
  {
    id: "ent_mira",
    name: "Mira Thornwood",
    type: "character",
    description: "The village healer with knowledge of old remedies and older secrets. Her herbs can heal wounds, but her whispered prayers can do far more.",
    backstory: "Born during an eclipse, Mira was marked from birth. The village both fears and needs her, a tension she has learned to navigate with careful grace.",
    traits: ["wise", "mysterious", "compassionate", "guarded"],
    status: "canon",
    referenceImage: IMAGES.mira,
  },
  {
    id: "ent_elder",
    name: "Elder Bramwell",
    type: "character",
    description: "The village elder who remembers the time before the curse. His memory holds the key to Ashwood's salvation—or its final doom.",
    backstory: "Bramwell was just a boy when the ritual went wrong. He has spent sixty years trying to forget what he saw, but some memories refuse to fade.",
    traits: ["ancient", "fearful", "burdened", "authoritative"],
    status: "canon",
    referenceImage: IMAGES.elder,
  },
  {
    id: "ent_shade",
    name: "The Hollow Shade",
    type: "creature",
    description: "A manifestation of the curse itself—a shifting darkness that speaks in the voices of the dead and hungers for living memories.",
    backstory: "Once human, the Shade was the first victim of the ritual that cursed Ashwood. Now it exists between life and death, bound to the village until the curse is broken.",
    traits: ["ethereal", "malevolent", "tragic", "ancient"],
    status: "canon",
    referenceImage: IMAGES.shade,
  },
  {
    id: "ent_ashwood",
    name: "Ashwood Village",
    type: "location",
    description: "A fog-shrouded village at the edge of the Blackwood Forest. Its crooked streets and weathered buildings hold secrets older than memory.",
    backstory: "Founded three centuries ago by settlers fleeing persecution, Ashwood prospered until the Great Ritual of 1723. Now it exists in a perpetual twilight, cut off from the outside world.",
    traits: ["isolated", "cursed", "atmospheric", "decaying"],
    status: "canon",
    referenceImage: IMAGES.ashwood,
  },
  {
    id: "ent_tavern",
    name: "The Drowning Crow Tavern",
    type: "location",
    description: "The only gathering place in Ashwood, where villagers drink to forget and strangers are met with suspicion. The fire never quite warms the room.",
    traits: ["dimly lit", "suspicious", "central", "haunted"],
    status: "canon",
    referenceImage: IMAGES.tavern,
  },
  {
    id: "ent_ruins",
    name: "The Broken Sanctum",
    type: "location",
    description: "Ruins of the old temple where the cursed ritual was performed. The stones still hum with residual power, and the shadows move of their own accord.",
    backstory: "Once a temple to forgotten gods, the Sanctum was converted for the ritual that would 'protect' Ashwood forever. Instead, it became the source of its damnation.",
    traits: ["dangerous", "powerful", "forbidden", "ancient"],
    status: "canon",
    referenceImage: IMAGES.ruins,
  },
  {
    id: "ent_amulet",
    name: "The Sundered Amulet",
    type: "object",
    description: "A broken medallion that once held the power to banish shadows. Silas carries one half; the other lies somewhere in Ashwood.",
    backstory: "Forged by the last true priest of the old temple, the amulet was split during the failed ritual. Reuniting it may be the only way to break the curse.",
    traits: ["powerful", "broken", "ancient", "hopeful"],
    status: "canon",
    referenceImage: IMAGES.amulet,
  },
  {
    id: "ent_tome",
    name: "The Grimoire of Endings",
    type: "object",
    description: "A forbidden text that contains the ritual used to curse Ashwood—and perhaps the key to undoing it. Its pages whisper to those who read them.",
    traits: ["dangerous", "forbidden", "essential", "corrupting"],
    status: "draft",
    referenceImage: IMAGES.tome,
  },
  {
    id: "ent_council",
    name: "The Village Council",
    type: "faction",
    description: "The five families who rule Ashwood, each hiding their own connection to the original curse. They will do anything to maintain their power.",
    traits: ["secretive", "corrupt", "influential", "desperate"],
    status: "canon",
  },
];

export const demoRelationships: DemoRelationship[] = [
  {
    id: "rel_1",
    sourceId: "ent_silas",
    targetId: "ent_mira",
    sourceName: "Silas the Wanderer",
    targetName: "Mira Thornwood",
    type: "allied_with",
    description: "Mira recognizes something in Silas—a shared burden. She offers him shelter and information.",
  },
  {
    id: "rel_2",
    sourceId: "ent_silas",
    targetId: "ent_shade",
    sourceName: "Silas the Wanderer",
    targetName: "The Hollow Shade",
    type: "hunted_by",
    description: "The Shade senses Silas's connection to the ritual and relentlessly pursues him.",
  },
  {
    id: "rel_3",
    sourceId: "ent_silas",
    targetId: "ent_amulet",
    sourceName: "Silas the Wanderer",
    targetName: "The Sundered Amulet",
    type: "possesses",
    description: "Silas carries half of the amulet, inherited from his mentor who died breaking the curse elsewhere.",
  },
  {
    id: "rel_4",
    sourceId: "ent_mira",
    targetId: "ent_ashwood",
    sourceName: "Mira Thornwood",
    targetName: "Ashwood Village",
    type: "protects",
    description: "Mira uses her gifts to shield the village from the worst of the curse's effects.",
  },
  {
    id: "rel_5",
    sourceId: "ent_elder",
    targetId: "ent_ruins",
    sourceName: "Elder Bramwell",
    targetName: "The Broken Sanctum",
    type: "knows_about",
    description: "Bramwell alone knows what really happened in the Sanctum that night.",
  },
  {
    id: "rel_6",
    sourceId: "ent_shade",
    targetId: "ent_ashwood",
    sourceName: "The Hollow Shade",
    targetName: "Ashwood Village",
    type: "bound_to",
    description: "The Shade cannot leave Ashwood's borders—it is as much a prisoner as the villagers.",
  },
  {
    id: "rel_7",
    sourceId: "ent_council",
    targetId: "ent_elder",
    sourceName: "The Village Council",
    targetName: "Elder Bramwell",
    type: "controls",
    description: "The Council uses Bramwell's guilt to keep him silent about the true nature of the curse.",
  },
  {
    id: "rel_8",
    sourceId: "ent_tome",
    targetId: "ent_ruins",
    sourceName: "The Grimoire of Endings",
    targetName: "The Broken Sanctum",
    type: "hidden_in",
    description: "The Grimoire lies in a sealed chamber beneath the ruins, guarded by the Shade.",
  },
  {
    id: "rel_9",
    sourceId: "ent_silas",
    targetId: "ent_elder",
    sourceName: "Silas the Wanderer",
    targetName: "Elder Bramwell",
    type: "seeks_knowledge_from",
    description: "Silas must convince Bramwell to reveal what he knows about the ritual.",
  },
  {
    id: "rel_10",
    sourceId: "ent_mira",
    targetId: "ent_council",
    sourceName: "Mira Thornwood",
    targetName: "The Village Council",
    type: "opposes",
    description: "Mira has long suspected the Council's involvement in maintaining the curse.",
  },
];

export const demoScenes: DemoScene[] = [
  {
    id: "scene_1",
    title: "Arrival at the Gates",
    prose: `The fog parted reluctantly as Silas approached the iron gates of Ashwood. They hung crooked on rusted hinges, as if the village itself was uncertain whether to admit him or turn him away.

Beyond the gates, the village materialized in fragments—first the cobblestones, slick with perpetual moisture, then the hunched shapes of buildings that seemed to lean toward each other like conspirators. No smoke rose from the chimneys. No dogs barked. The silence was not peaceful but pregnant with unspoken dread.

Silas touched the half-amulet beneath his shirt. It pulsed with a faint warmth—the first sign of life he'd felt from it in months. Whatever cursed this place was old and powerful.

He stepped through the gates.

Behind him, they groaned shut of their own accord.`,
    imageUrl: IMAGES.scene1,
    participantIds: ["ent_silas"],
    locationId: "ent_ashwood",
    events: ["Silas arrives at Ashwood", "Gates close mysteriously"],
    position: 0,
    status: "canon",
  },
  {
    id: "scene_2",
    title: "The Drowning Crow",
    prose: `The tavern's warmth was an illusion—Silas realized this the moment he stepped inside. The fire blazed in its hearth, but the cold clung to his bones as if the flames were merely painted on canvas.

A dozen faces turned toward him, their expressions ranging from suspicion to outright hostility. Conversation died. Tankards paused halfway to lips.

"Stranger." The word came from behind the bar, where a thick-armed woman polished a glass that would never truly be clean. "We don't get many of your kind."

"My kind?"

"The living kind. The ones who still have choices."

Before Silas could respond, a figure detached from the shadows near the back. A woman with silver-shot dark hair and eyes that held too much knowledge. She placed a hand on his arm, and he felt actual warmth for the first time since entering the village.

"This one's with me, Greta," she said. "I've been expecting him."`,
    imageUrl: IMAGES.scene2,
    participantIds: ["ent_silas", "ent_mira"],
    locationId: "ent_tavern",
    events: ["Silas enters the tavern", "Mira reveals she expected him"],
    position: 1,
    status: "canon",
  },
  {
    id: "scene_3",
    title: "Whispers in the Ruins",
    prose: `The Broken Sanctum rose against the perpetual grey sky like a wound in the earth. Stones that had once formed proud arches now lay scattered, covered in moss that seemed to pulse with an inner phosphorescence.

"You shouldn't have come here," Mira whispered, but she didn't turn back. Neither did Silas.

The entrance yawned before them, darker than any natural shadow had a right to be. And from within came a sound—not quite voices, not quite wind. Something in between. Something hungry.

Silas drew out the half-amulet. In the presence of the Sanctum, it blazed with sudden light, and the whispers recoiled.

"So it's true," Mira breathed. "You carry half of the Seal."

"Somewhere in there lies the other half," Silas said. "Along with answers I've been seeking for seven years."

The shadows at the entrance began to coalesce, taking shape. The Hollow Shade was coming.`,
    imageUrl: IMAGES.scene3,
    participantIds: ["ent_silas", "ent_mira", "ent_shade"],
    locationId: "ent_ruins",
    events: ["Discovery of the amulet's power", "The Shade manifests"],
    position: 2,
    status: "canon",
  },
  {
    id: "scene_4",
    title: "The Elder's Confession",
    prose: `Elder Bramwell's hands shook as he poured the tea. Not from age—from fear. The kind of fear that had lived in his bones for six decades.

"I was just a boy," he said, not meeting Silas's eyes. "They said the ritual would protect us. Keep the forest's darkness at bay forever. They didn't tell us the cost."

"What cost?"

"A soul." Bramwell finally looked up, and Silas saw tears tracing the wrinkles of his weathered face. "My sister's soul. She volunteered, thinking she'd become a guardian spirit. Instead..."

"The Shade."

"She doesn't remember who she was. But sometimes, when the fog is thickest, I hear her voice. Calling for me. Asking why I let them take her."

Silas leaned forward. "The Grimoire of Endings. Where is it?"

"Buried with her. Beneath the altar in the Sanctum. But getting to it means facing what she's become. And I don't think she'll let you reach it without taking something in return."`,
    imageUrl: IMAGES.scene4,
    participantIds: ["ent_silas", "ent_elder"],
    locationId: "ent_ashwood",
    events: ["Bramwell reveals the truth about the curse", "Location of the Grimoire revealed"],
    position: 3,
    status: "draft",
  },
];

// Helper to get relationships for an entity
export function getEntityRelationships(entityId: string) {
  return demoRelationships.filter(
    (r) => r.sourceId === entityId || r.targetId === entityId
  ).map((r) => ({
    ...r,
    direction: r.sourceId === entityId ? "outgoing" : "incoming" as const,
  }));
}

// Helper to get scenes an entity appears in
export function getEntityScenes(entityId: string) {
  return demoScenes.filter(
    (s) => s.participantIds.includes(entityId) || s.locationId === entityId
  );
}

// Helper to get entity by ID
export function getEntityById(entityId: string) {
  return demoEntities.find((e) => e.id === entityId);
}
