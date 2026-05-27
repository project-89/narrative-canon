/**
 * Validation helpers for the Nit format v1.
 *
 * Each validate* function returns a discriminated union: { ok: true, value }
 * or { ok: false, errors: ZodIssue[] }. Tools can render the issues as needed.
 */

import { z } from 'zod';
import {
  NarrativeSchema,
  RepoManifestSchema,
  CommitSchema,
  GraphOperationSchema,
  type Narrative,
  type RepoManifest,
  type Commit,
  type GraphOperation,
} from './schemas';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: z.ZodIssue[] };

function runValidator<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, errors: result.error.issues };
}

export function validateNarrative(input: unknown): ValidationResult<Narrative> {
  return runValidator(NarrativeSchema, input);
}

export function validateRepoManifest(input: unknown): ValidationResult<RepoManifest> {
  return runValidator(RepoManifestSchema, input);
}

export function validateCommit(input: unknown): ValidationResult<Commit> {
  return runValidator(CommitSchema, input);
}

export function validateOperation(input: unknown): ValidationResult<GraphOperation> {
  return runValidator(GraphOperationSchema, input);
}

/**
 * Format zod issues as human-readable lines. Tools can display these directly
 * or use the raw issues for richer UIs.
 */
export function formatIssues(issues: z.ZodIssue[]): string[] {
  return issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join('.') : '<root>';
    return `${path}: ${i.message}`;
  });
}

/**
 * Verify the major version of a formatVersion string is compatible with the
 * caller's supported major. Used at file-open time to refuse forward-incompatible
 * documents.
 */
export function isMajorVersionCompatible(
  documentVersion: string,
  supportedMajor: number
): boolean {
  const match = documentVersion.match(/^(\d+)\./);
  if (!match) return false;
  const docMajor = parseInt(match[1], 10);
  return docMajor === supportedMajor;
}
