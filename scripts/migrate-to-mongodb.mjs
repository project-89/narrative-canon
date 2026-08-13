/**
 * Intentionally disabled.
 *
 * The legacy Mongo adapter stores a fixed subset of ProjectData. Migrating a
 * current studio project into it would silently discard production, style,
 * script, asset, and future fields. Keep this executable as a hard guard for
 * old runbooks and shell history.
 */

console.error(
  'MongoDB migration is disabled because the legacy adapter is not lossless. ' +
  'Keep using the file store until a complete round-trip migration exists.'
);
process.exitCode = 1;
