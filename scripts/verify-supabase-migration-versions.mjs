/**
 * Supabase identifies migrations by the numeric prefix, not the descriptive
 * filename. Two distinct files with the same prefix cannot be safely deployed.
 * Read-only repository check; it never executes or repairs a migration.
 */
export function assertUniqueSupabaseMigrationVersions(filenames) {
  const versions = new Map();
  for (const name of filenames.filter((file) => file.endsWith('.sql'))) {
    const match = /^(\d+)_[^/]+\.sql$/.exec(name);
    if (!match) throw new Error(`Invalid Supabase migration filename: ${name}`);

    const version = match[1];
    const previous = versions.get(version);
    if (previous !== undefined) {
      throw new Error(
        `Duplicate Supabase migration version ${version}: ${previous} and ${name}`,
      );
    }
    versions.set(version, name);
  }
}
