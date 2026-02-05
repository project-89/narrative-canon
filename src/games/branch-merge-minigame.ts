import chalk from 'chalk';
import * as readline from 'readline';
import { TimelineBranch } from './mission-generator';
import { LLMAdapter } from '../types';
import { z } from 'zod';

// Schema for conflict resolution suggestions
const ConflictResolutionSchema = z.object({
  resolutions: z.array(z.object({
    conflictId: z.string(),
    option1: z.object({
      choice: z.literal('branch1'),
      description: z.string(),
      consequences: z.string()
    }),
    option2: z.object({
      choice: z.literal('branch2'),
      description: z.string(),
      consequences: z.string()
    }),
    option3: z.object({
      choice: z.literal('hybrid'),
      description: z.string(),
      consequences: z.string()
    }),
    recommendation: z.string()
  }))
});

export interface TimelineConflict {
  id: string;
  branch1: string;
  branch2: string;
  conflictType: 'entity_state' | 'relationship' | 'location' | 'outcome';
  description: string;
  entities: string[];
  branch1Context: string;
  branch2Context: string;
}

export class BranchMergeMinigame {
  private rl: readline.Interface;

  constructor(private llmAdapter: LLMAdapter) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async playMergeMinigame(
    branch1: TimelineBranch,
    branch2: TimelineBranch,
    conflicts: TimelineConflict[]
  ): Promise<Map<string, 'branch1' | 'branch2' | 'hybrid'>> {
    console.clear();
    this.displayMergeIntro(branch1, branch2);

    if (conflicts.length === 0) {
      console.log(chalk.green('\n✅ No conflicts detected! These timelines can merge cleanly.'));
      await this.pause();
      return new Map();
    }

    console.log(chalk.yellow(`\n⚠️  Timeline Convergence Detected! ${conflicts.length} conflicts must be resolved.\n`));
    
    const resolutions = new Map<string, 'branch1' | 'branch2' | 'hybrid'>();

    // Generate AI suggestions for each conflict
    const suggestions = await this.generateResolutionSuggestions(branch1, branch2, conflicts);

    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i];
      const suggestion = suggestions.resolutions[i];
      
      console.log(chalk.cyan(`\n═══ CONFLICT ${i + 1}/${conflicts.length} ═══`));
      console.log(chalk.white(`Type: ${conflict.conflictType.toUpperCase()}`));
      console.log(chalk.white(`Description: ${conflict.description}`));
      console.log(chalk.white(`Affected Entities: ${conflict.entities.join(', ')}`));

      this.displayConflictDetails(conflict);

      console.log(chalk.yellow('\n🤖 AI MISSION DIRECTOR ANALYSIS:'));
      console.log(chalk.gray(suggestion.recommendation));

      const choice = await this.getResolutionChoice(suggestion);
      resolutions.set(conflict.id, choice);

      this.displayChoiceOutcome(choice, suggestion);
    }

    await this.displayMergeComplete(resolutions);
    return resolutions;
  }

  private displayMergeIntro(branch1: TimelineBranch, branch2: TimelineBranch): void {
    console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║               TIMELINE CONVERGENCE PROTOCOL                     ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════╝'));
    
    console.log(chalk.white('\nQuantum interference detected between parallel timeline branches:'));
    console.log(chalk.blue(`\n📈 ${branch1.name}`));
    console.log(chalk.gray(`   Divergence: ${branch1.divergenceLevel}%`));
    console.log(chalk.gray(`   Missions: ${branch1.missionHistory.length}`));
    console.log(chalk.gray(`   Last Operation: ${branch1.missionHistory[branch1.missionHistory.length - 1]?.title || 'None'}`));

    console.log(chalk.green(`\n📉 ${branch2.name}`));
    console.log(chalk.gray(`   Divergence: ${branch2.divergenceLevel}%`));
    console.log(chalk.gray(`   Missions: ${branch2.missionHistory.length}`));
    console.log(chalk.gray(`   Last Operation: ${branch2.missionHistory[branch2.missionHistory.length - 1]?.title || 'None'}`));

    console.log(chalk.yellow('\n⚡ These timelines are converging and must be merged to prevent reality collapse!'));
    console.log(chalk.white('Your choices will determine the final timeline configuration...'));
  }

  private displayConflictDetails(conflict: TimelineConflict): void {
    console.log(chalk.blue(`\n📘 ${conflict.branch1} Context:`));
    console.log(chalk.gray(`   ${conflict.branch1Context}`));
    
    console.log(chalk.green(`\n📗 ${conflict.branch2} Context:`));
    console.log(chalk.gray(`   ${conflict.branch2Context}`));
  }

  private async getResolutionChoice(suggestion: any): Promise<'branch1' | 'branch2' | 'hybrid'> {
    console.log(chalk.white('\n🎯 Resolution Options:'));
    console.log(chalk.blue(`\n1. ${suggestion.option1.description}`));
    console.log(chalk.gray(`   Consequences: ${suggestion.option1.consequences}`));
    
    console.log(chalk.green(`\n2. ${suggestion.option2.description}`));
    console.log(chalk.gray(`   Consequences: ${suggestion.option2.consequences}`));
    
    console.log(chalk.magenta(`\n3. ${suggestion.option3.description}`));
    console.log(chalk.gray(`   Consequences: ${suggestion.option3.consequences}`));

    while (true) {
      const choice = await this.prompt('\nChoose resolution (1, 2, or 3): ');
      
      switch (choice.trim()) {
        case '1':
          return 'branch1';
        case '2':
          return 'branch2';
        case '3':
          return 'hybrid';
        default:
          console.log(chalk.red('Invalid choice. Please enter 1, 2, or 3.'));
      }
    }
  }

  private displayChoiceOutcome(choice: 'branch1' | 'branch2' | 'hybrid', suggestion: any): void {
    const choiceMap = {
      'branch1': suggestion.option1,
      'branch2': suggestion.option2,
      'hybrid': suggestion.option3
    };

    const chosen = choiceMap[choice];
    console.log(chalk.green(`\n✅ Resolution Applied: ${chosen.description}`));
    console.log(chalk.yellow(`⚡ Timeline Effect: ${chosen.consequences}`));
  }

  private async generateResolutionSuggestions(
    branch1: TimelineBranch,
    branch2: TimelineBranch,
    conflicts: TimelineConflict[]
  ): Promise<any> {
    const prompt = `
You are the AI Mission Director for Project 89's Timeline Convergence Protocol. Two timeline branches are merging and you must provide resolution options for each conflict.

BRANCH 1: ${branch1.name} (${branch1.divergenceLevel}% divergence)
Recent missions: ${branch1.missionHistory.slice(-3).map(m => m.title).join(', ')}

BRANCH 2: ${branch2.name} (${branch2.divergenceLevel}% divergence)  
Recent missions: ${branch2.missionHistory.slice(-3).map(m => m.title).join(', ')}

CONFLICTS TO RESOLVE:
${conflicts.map((c, i) => `
${i + 1}. ${c.description}
   Type: ${c.conflictType}
   Entities: ${c.entities.join(', ')}
   Branch 1 Context: ${c.branch1Context}
   Branch 2 Context: ${c.branch2Context}
`).join('\n')}

For each conflict, provide three resolution options:
1. Accept Branch 1's version
2. Accept Branch 2's version  
3. Create a hybrid solution that combines both

Make your suggestions maintain narrative consistency while offering meaningful choices that affect the timeline's future. Each option should have clear consequences.

Return your response as a JSON object with the following structure:
{
  "resolutions": [
    {
      "conflictId": "conflict_1",
      "option1": {
        "choice": "branch1",
        "description": "Accept Branch 1's version of events",
        "consequences": "What happens if we choose this path"
      },
      "option2": {
        "choice": "branch2", 
        "description": "Accept Branch 2's version of events",
        "consequences": "What happens if we choose this path"
      },
      "option3": {
        "choice": "hybrid",
        "description": "Create a hybrid solution",
        "consequences": "What happens if we choose this path"
      },
      "recommendation": "AI analysis of which choice might be best and why"
    }
  ]
}`;

    try {
      return await this.llmAdapter.generateStructuredOutput(
        prompt,
        ConflictResolutionSchema,
        {
          temperature: 0.6,
          modelPreference: 'smart'
        }
      );
    } catch (error) {
      console.error('Error generating conflict resolutions:', error);
      // Return fallback suggestions
      return {
        resolutions: conflicts.map((conflict, i) => ({
          conflictId: `conflict_${i}`,
          option1: {
            choice: 'branch1',
            description: `Maintain ${branch1.name}'s version of events`,
            consequences: 'Timeline stability favors established narrative'
          },
          option2: {
            choice: 'branch2',
            description: `Adopt ${branch2.name}'s version of events`,
            consequences: 'Alternative timeline elements become dominant'
          },
          option3: {
            choice: 'hybrid',
            description: 'Merge both realities into a new configuration',
            consequences: 'Creates unprecedented timeline possibilities'
          },
          recommendation: 'Consider which resolution best serves the resistance against Oneirocom'
        }))
      };
    }
  }

  private async displayMergeComplete(resolutions: Map<string, 'branch1' | 'branch2' | 'hybrid'>): Promise<void> {
    console.log(chalk.bold.green('\n╔══════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.green('║                    TIMELINE MERGE COMPLETE                      ║'));
    console.log(chalk.bold.green('╚══════════════════════════════════════════════════════════════════╝'));

    const resolutionCounts = Array.from(resolutions.values()).reduce((acc, choice) => {
      acc[choice] = (acc[choice] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(chalk.white('\n📊 Resolution Summary:'));
    if (resolutionCounts.branch1) console.log(chalk.blue(`   Branch 1 choices: ${resolutionCounts.branch1}`));
    if (resolutionCounts.branch2) console.log(chalk.green(`   Branch 2 choices: ${resolutionCounts.branch2}`));
    if (resolutionCounts.hybrid) console.log(chalk.magenta(`   Hybrid solutions: ${resolutionCounts.hybrid}`));

    console.log(chalk.yellow('\n⚡ Quantum flux stabilizing... The merged timeline is taking shape.'));
    console.log(chalk.cyan('🌟 Your choices have created a new reality configuration!'));
    
    await this.pause();
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  private async pause(): Promise<void> {
    await this.prompt('\nPress Enter to continue...');
  }

  close(): void {
    this.rl.close();
  }
}

export default BranchMergeMinigame;