/**
 * Tests for Non-Linear Timeline Functionality
 */

import { NarrativeGit } from './narrative-git';
import { MockLLM } from './llm/mock';

describe('Non-Linear Timeline Support', () => {
  let git: NarrativeGit;
  let mockLLM: MockLLM;

  beforeEach(() => {
    mockLLM = new MockLLM();
    git = NarrativeGit.withLLM(mockLLM);
  });

  test('should add events at specific narrative dates', async () => {
    // Add events out of chronological order
    const event2045 = await git.addAtTime(
      "Alexandra leads the resistance attack on Oneirocom Tower.",
      new Date('2045-06-15'),
      "Mission 2045: Tower Assault"
    );

    const event2030 = await git.addAtTime(
      "Young Alexandra discovers her hacking abilities.",
      new Date('2030-03-20'),
      "Origin: Alexandra's awakening"
    );

    const event2038 = await git.addAtTime(
      "Alexandra joins the underground resistance movement.",
      new Date('2038-11-07'),
      "Turning point: Joining the resistance"
    );

    // Verify commits have narrative dates
    expect(event2045.narrativeDate).toEqual(new Date('2045-06-15'));
    expect(event2030.narrativeDate).toEqual(new Date('2030-03-20'));
    expect(event2038.narrativeDate).toEqual(new Date('2038-11-07'));

    // Get timeline in narrative order (not commit order)
    const timeline = git.timeline();
    
    // Should be ordered by narrative date
    expect(timeline[0].narrativeDate).toEqual(new Date('2030-03-20'));
    expect(timeline[1].narrativeDate).toEqual(new Date('2038-11-07'));
    expect(timeline[2].narrativeDate).toEqual(new Date('2045-06-15'));
  });

  test('should query events by narrative date range', async () => {
    // Add events across different years
    await git.addAtTime("Event in 2027", new Date('2027-01-15'), "Early event");
    await git.addAtTime("Event in 2035", new Date('2035-06-20'), "Mid event");
    await git.addAtTime("Event in 2042", new Date('2042-12-31'), "Late event");
    await git.addAtTime("Event in 2050", new Date('2050-03-10'), "Future event");

    // Query specific range
    const thirties = git.timelineRange(
      new Date('2030-01-01'),
      new Date('2039-12-31')
    );

    expect(thirties).toHaveLength(1);
    expect(thirties[0].message).toBe("Mid event");

    // Query specific year
    const year2042 = git.timelineYear(2042);
    expect(year2042).toHaveLength(1);
    expect(year2042[0].message).toBe("Late event");
  });

  test('should handle events on same date with ordering', async () => {
    const sameDate = new Date('2040-07-04');

    // Add multiple events on same date
    const morning = await git.add(
      "Morning: Oneirocom announces new surveillance program.",
      "Morning announcement",
      "2040-07-04 Morning",
      sameDate
    );

    const afternoon = await git.add(
      "Afternoon: Resistance hackers infiltrate the announcement.",
      "Afternoon hack",
      "2040-07-04 Afternoon",
      sameDate
    );

    const evening = await git.add(
      "Evening: City-wide protests begin.",
      "Evening protests",
      "2040-07-04 Evening",
      sameDate
    );

    // Events on same date should maintain commit order
    const timeline = git.timeline();
    const july4Events = timeline.filter(c => 
      c.narrativeDate?.toDateString() === sameDate.toDateString()
    );

    expect(july4Events).toHaveLength(3);
    expect(july4Events[0].message).toContain("Morning");
    expect(july4Events[1].message).toContain("Afternoon");
    expect(july4Events[2].message).toContain("Evening");
  });

  test('should mix dated and undated commits', async () => {
    // Add some dated events
    await git.addAtTime("Dated event 1", new Date('2035-01-01'), "Dated 1");
    await git.addAtTime("Dated event 2", new Date('2040-01-01'), "Dated 2");

    // Add undated events (no narrative date)
    await git.add("Undated meta-narrative about the story", "Meta comment");
    await git.add("Another undated observation", "Observer note");

    const timeline = git.timeline();

    // Dated events should come first (in order)
    expect(timeline[0].message).toBe("Dated 1");
    expect(timeline[1].message).toBe("Dated 2");
    
    // Undated events should come after
    expect(timeline[2].message).toBe("Meta comment");
    expect(timeline[3].message).toBe("Observer note");
  });

  test('should detect temporal conflicts', async () => {
    // Add event where character dies
    await git.addAtTime(
      "Agent Smith is killed in the explosion at the facility.",
      new Date('2041-05-15'),
      "Agent Smith death"
    );

    // Try to add event with same character after death
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    await git.addAtTime(
      "Agent Smith reports back from successful mission.",
      new Date('2042-03-20'),
      "Agent Smith mission (should conflict)"
    );

    // Should have warned about temporal conflict
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Temporal conflicts detected'),
      expect.any(Array)
    );

    consoleSpy.mockRestore();
  });

  test('game mission example: non-linear mission completion', async () => {
    // Simulate players completing missions out of order
    
    // Player 1 completes 2042 mission first
    const mission2042 = await git.addAtTime(
      `Agent X7-391 infiltrated the neural processing center.
       Discovered evidence of consciousness extraction experiments.
       Planted liberation virus in the mainframe.`,
      new Date('2042-09-15'),
      "[2042-09-15] Mission: Neural Center Infiltration",
      "Mission Report 2042"
    );

    // Player 2 completes earlier 2038 mission
    const mission2038 = await git.addAtTime(
      `Agent K9-102 made first contact with resistance cell.
       Established secure communication channels.
       Recruited three Oneirocom defectors.`,
      new Date('2038-04-22'),
      "[2038-04-22] Mission: First Contact",
      "Mission Report 2038"
    );

    // Player 3 fills in gap with 2040 mission
    const mission2040 = await git.addAtTime(
      `Agent M3-847 sabotaged Oneirocom supply lines.
       Disrupted consciousness harvesting for two weeks.
       Escaped with classified Project Omega files.`,
      new Date('2040-07-08'),
      "[2040-07-08] Mission: Supply Sabotage",
      "Mission Report 2040"
    );

    // Timeline should show proper chronological order
    const timeline = git.timeline();
    const missionReports = timeline.filter(c => c.message.includes("Mission:"));

    expect(missionReports[0].narrativeDate).toEqual(new Date('2038-04-22'));
    expect(missionReports[1].narrativeDate).toEqual(new Date('2040-07-08'));
    expect(missionReports[2].narrativeDate).toEqual(new Date('2042-09-15'));

    // Query specific time period for game UI
    const early2040s = git.timelineRange(
      new Date('2040-01-01'),
      new Date('2042-12-31')
    );

    expect(early2040s).toHaveLength(2); // 2040 and 2042 missions
    expect(early2040s[0].message).toContain("Supply Sabotage");
    expect(early2040s[1].message).toContain("Neural Center");
  });
});