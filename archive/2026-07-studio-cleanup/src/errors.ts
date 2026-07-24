/**
 * Custom error classes for the narrative canon system
 * @module errors
 */

/**
 * Base error class for all narrative canon errors
 */
export class NarrativeCanonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeCanonError';
    Object.setPrototypeOf(this, NarrativeCanonError.prototype);
  }
}

/**
 * Thrown when a player action would violate a canon event
 * 
 * @example
 * ```typescript
 * throw new CanonViolationError(
 *   'villain_survival',
 *   'Cannot remove villain before final battle',
 *   { playerId: 'player1', action: 'entity_remove', entityId: 'villain' }
 * );
 * ```
 */
export class CanonViolationError extends NarrativeCanonError {
  public readonly canonEventId: string;
  public readonly violationDetails: any;

  constructor(canonEventId: string, message: string, violationDetails?: any) {
    super(message);
    this.name = 'CanonViolationError';
    this.canonEventId = canonEventId;
    this.violationDetails = violationDetails;
    Object.setPrototypeOf(this, CanonViolationError.prototype);
  }
}

/**
 * Thrown when timeline operations encounter conflicts
 * 
 * @example
 * ```typescript
 * throw new TimelineConflictError(
 *   'Cannot merge timelines: Conflicting entity states',
 *   ['Entity hero has different health values', 'Entity villain has different locations']
 * );
 * ```
 */
export class TimelineConflictError extends NarrativeCanonError {
  public readonly conflicts: string[];

  constructor(message: string, conflicts: string[]) {
    super(message);
    this.name = 'TimelineConflictError';
    this.conflicts = conflicts;
    Object.setPrototypeOf(this, TimelineConflictError.prototype);
  }
}

/**
 * Thrown when narrative structure validation fails
 * 
 * @example
 * ```typescript
 * throw new InvalidNarrativeError(
 *   'Invalid narrative structure',
 *   { missing: ['entities', 'scenes'], invalid: ['relationships'] }
 * );
 * ```
 */
export class InvalidNarrativeError extends NarrativeCanonError {
  public readonly validationErrors: any;

  constructor(message: string, validationErrors: any) {
    super(message);
    this.name = 'InvalidNarrativeError';
    this.validationErrors = validationErrors;
    Object.setPrototypeOf(this, InvalidNarrativeError.prototype);
  }
}

/**
 * Thrown when an entity operation fails
 * 
 * @example
 * ```typescript
 * throw new EntityNotFoundError('hero', 'update');
 * ```
 */
export class EntityNotFoundError extends NarrativeCanonError {
  public readonly entityId: string;
  public readonly operation: string;

  constructor(entityId: string, operation: string) {
    super(`Entity '${entityId}' not found for operation: ${operation}`);
    this.name = 'EntityNotFoundError';
    this.entityId = entityId;
    this.operation = operation;
    Object.setPrototypeOf(this, EntityNotFoundError.prototype);
  }
}

/**
 * Thrown when a timeline operation fails
 * 
 * @example
 * ```typescript
 * throw new TimelineNotFoundError('alternate_timeline');
 * ```
 */
export class TimelineNotFoundError extends NarrativeCanonError {
  public readonly timelineId: string;

  constructor(timelineId: string) {
    super(`Timeline '${timelineId}' not found`);
    this.name = 'TimelineNotFoundError';
    this.timelineId = timelineId;
    Object.setPrototypeOf(this, TimelineNotFoundError.prototype);
  }
}

/**
 * Thrown when sequence ordering is violated
 * 
 * @example
 * ```typescript
 * throw new InvalidSequenceError(10, 5, 'Cannot apply change to past sequence');
 * ```
 */
export class InvalidSequenceError extends NarrativeCanonError {
  public readonly expectedSequence: number;
  public readonly actualSequence: number;

  constructor(expectedSequence: number, actualSequence: number, message?: string) {
    super(message || `Invalid sequence: expected ${expectedSequence}, got ${actualSequence}`);
    this.name = 'InvalidSequenceError';
    this.expectedSequence = expectedSequence;
    this.actualSequence = actualSequence;
    Object.setPrototypeOf(this, InvalidSequenceError.prototype);
  }
}

/**
 * Thrown when player permissions are insufficient
 * 
 * @example
 * ```typescript
 * throw new InsufficientPermissionsError(
 *   'player1',
 *   'timeline:create',
 *   ['timeline:read', 'timeline:write']
 * );
 * ```
 */
export class InsufficientPermissionsError extends NarrativeCanonError {
  public readonly playerId: string;
  public readonly requiredPermission: string;
  public readonly playerPermissions: string[];

  constructor(playerId: string, requiredPermission: string, playerPermissions: string[]) {
    super(`Player '${playerId}' lacks permission: ${requiredPermission}`);
    this.name = 'InsufficientPermissionsError';
    this.playerId = playerId;
    this.requiredPermission = requiredPermission;
    this.playerPermissions = playerPermissions;
    Object.setPrototypeOf(this, InsufficientPermissionsError.prototype);
  }
}