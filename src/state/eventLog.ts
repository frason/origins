/**
 * Event Log for Lineage Tracking and Replay
 *
 * Maintains a persistent in-memory log of all simulation events:
 * births, mutations, extinctions, and speciation events.
 * Used to populate the SpeciesPanel lineage tree and enable replay.
 */

/**
 * Event types in the simulation
 */
export type EventType = 'birth' | 'mutation' | 'extinction' | 'speciation';

/**
 * A single simulation event
 */
export interface SimEvent {
  type: EventType;
  tick: number;
  speciesId: string;
  detail: string;
}

/**
 * Simple in-memory event log
 */
class EventLog {
  private events: SimEvent[] = [];

  /**
   * Log a new event
   */
  logEvent(event: SimEvent): void {
    this.events.push(event);
  }

  /**
   * Retrieve all events
   */
  getEvents(): SimEvent[] {
    return [...this.events];
  }

  /**
   * Clear all events (e.g., on world reset)
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Get events filtered by species ID
   */
  getEventsBySpecies(speciesId: string): SimEvent[] {
    return this.events.filter((e) => e.speciesId === speciesId);
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: EventType): SimEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length;
  }
}

// Single instance for global use
export const eventLog = new EventLog();
