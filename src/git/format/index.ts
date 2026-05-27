/**
 * Public entrypoint for the Nit narrative format.
 *
 * Consumer apps and authoring tools import from here:
 *
 *   import { NarrativeSchema, validateNarrative, migrateStudioProjectToV1 }
 *     from '@narrative/canon/format';
 */

export * from './v1/schemas';
export * from './v1/validate';
export * from './v1/canonicalize';
export { migrateStudioProjectToV1, PLACEHOLDER_PREFIX } from './v1/migrate-from-studio';
