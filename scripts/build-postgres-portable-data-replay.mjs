import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Expected --input, --output, --target-catalog, and --report arguments.');
    }
    args.set(key, value);
  }
  for (const key of ['--input', '--output', '--target-catalog', '--report']) {
    if (!args.has(key)) {
      throw new Error(`Missing required argument: ${key}`);
    }
  }
  return args;
}

function parseQuotedIdentifiers(raw) {
  const values = [];
  let index = 0;
  while (index < raw.length) {
    while (raw[index] === ' ') index += 1;
    if (raw[index] !== '"') throw new Error(`Unsupported COPY column list: ${raw}`);
    index += 1;
    let value = '';
    let closed = false;
    while (index < raw.length) {
      if (raw[index] === '"') {
        if (raw[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      value += raw[index];
      index += 1;
    }
    if (!closed) throw new Error(`Unterminated COPY identifier: ${raw}`);
    values.push(value);
    while (raw[index] === ' ') index += 1;
    if (index === raw.length) break;
    if (raw[index] !== ',') throw new Error(`Unsupported COPY column separator: ${raw}`);
    index += 1;
  }
  if (values.length === 0) throw new Error(`COPY statement has no columns: ${raw}`);
  return values;
}

function parseCopyHeader(line) {
  const match = line.match(/^COPY "((?:[^"]|"")+)"\."((?:[^"]|"")+)" \((.*)\) FROM stdin;$/);
  if (!match) {
    if (line.startsWith('COPY ')) throw new Error(`Unsupported COPY statement: ${line}`);
    return null;
  }
  return {
    schema: match[1].replaceAll('""', '"'),
    table: match[2].replaceAll('""', '"'),
    columns: parseQuotedIdentifiers(match[3]),
  };
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildCopyHeader(copy, columns) {
  return `COPY ${quoteIdentifier(copy.schema)}.${quoteIdentifier(copy.table)} (${columns.map(quoteIdentifier).join(', ')}) FROM stdin;`;
}

function buildCatalog(records) {
  if (!Array.isArray(records)) throw new Error('Target catalog must be a JSON array.');
  const catalog = new Map();
  for (const record of records) {
    const schema = record?.table_schema;
    const table = record?.table_name;
    const column = record?.column_name;
    if (typeof schema !== 'string' || typeof table !== 'string' || typeof column !== 'string') {
      throw new Error('Target catalog row is missing table_schema, table_name, or column_name.');
    }
    const key = `${schema}\u0000${table}`;
    if (!catalog.has(key)) catalog.set(key, new Map());
    catalog.get(key).set(column, {
      notNull: record.not_null === true,
      hasDefault: record.has_default === true,
      isIdentity: record.is_identity === true,
      isGenerated: record.is_generated === true,
    });
  }
  return catalog;
}

function assessCompatibility(copy, catalog) {
  const key = `${copy.schema}\u0000${copy.table}`;
  const targetColumns = catalog.get(key);
  if (!targetColumns) {
    return {
      mode: 'skip',
      reason: 'target_relation_missing',
      unsupportedSourceColumns: [],
      requiredTargetColumns: [],
      replayColumns: [],
      replayColumnIndexes: [],
    };
  }

  const sourceColumns = new Set(copy.columns);
  const unsupportedSourceColumns = copy.columns.filter((column) => {
    const metadata = targetColumns.get(column);
    return !metadata || metadata.isGenerated;
  });
  const requiredTargetColumns = [...targetColumns.entries()]
    .filter(([column, metadata]) => !sourceColumns.has(column) && metadata.notNull && !metadata.hasDefault && !metadata.isIdentity && !metadata.isGenerated)
    .map(([column]) => column)
    .sort();
  const replayColumnIndexes = copy.columns
    .map((column, index) => ({ column, index, metadata: targetColumns.get(column) }))
    .filter(({ metadata }) => metadata && !metadata.isGenerated)
    .map(({ index }) => index);
  const replayColumns = replayColumnIndexes.map((index) => copy.columns[index]);

  if (requiredTargetColumns.length > 0) {
    return {
      mode: 'skip',
      reason: 'target_requires_unbacked_columns',
      unsupportedSourceColumns,
      requiredTargetColumns,
      replayColumns,
      replayColumnIndexes,
    };
  }
  if (replayColumns.length === 0) {
    return {
      mode: 'skip',
      reason: 'no_copyable_shared_columns',
      unsupportedSourceColumns,
      requiredTargetColumns,
      replayColumns,
      replayColumnIndexes,
    };
  }
  if (unsupportedSourceColumns.length > 0) {
    return {
      mode: 'project',
      reason: 'source_columns_projected_to_target',
      unsupportedSourceColumns,
      requiredTargetColumns,
      replayColumns,
      replayColumnIndexes,
    };
  }
  return {
    mode: 'exact',
    reason: 'compatible',
    unsupportedSourceColumns,
    requiredTargetColumns,
    replayColumns,
    replayColumnIndexes,
  };
}

function projectCopyRow(line, copyBlock) {
  const fields = line.split('\t');
  if (fields.length !== copyBlock.sourceColumnCount) {
    throw new Error(
      `COPY row field count mismatch for ${copyBlock.relation}: expected ${copyBlock.sourceColumnCount}, got ${fields.length}`,
    );
  }
  return copyBlock.replayColumnIndexes.map((index) => fields[index]).join('\t');
}

export async function transformPortableDataReplay({ inputPath, outputPath, targetCatalogPath, reportPath }) {
  const catalog = buildCatalog(JSON.parse(await readFile(targetCatalogPath, 'utf8')));
  const input = createReadStream(inputPath, { encoding: 'utf8' });
  const output = createWriteStream(outputPath, { encoding: 'utf8', mode: 0o600 });
  const reader = createInterface({ input, crlfDelay: Infinity });
  const skipped = [];
  const projected = [];
  const replayedProviderBlocks = [];
  const replayedProvider = new Set();
  const replayedApplication = new Set();
  let copyBlock = null;
  let sourceCopyBlocks = 0;
  let replayedCopyBlocks = 0;

  try {
    for await (const line of reader) {
      if (copyBlock) {
        if (line === '\\.') {
          if (copyBlock.replay) output.write('\\.\n');
          copyBlock = null;
        } else if (copyBlock.replay) {
          output.write(`${copyBlock.mode === 'project' ? projectCopyRow(line, copyBlock) : line}\n`);
        }
        continue;
      }

      const copy = parseCopyHeader(line);
      if (!copy) {
        output.write(`${line}\n`);
        continue;
      }

      sourceCopyBlocks += 1;
      const compatibility = assessCompatibility(copy, catalog);
      const applicationOwned = copy.schema === 'public';
      const relation = `${copy.schema}.${copy.table}`;

      if (applicationOwned && compatibility.mode !== 'exact') {
        throw new Error(`Application COPY target mismatch for ${relation}: ${compatibility.reason}`);
      }

      if (compatibility.mode === 'skip') {
        skipped.push({
          schema: copy.schema,
          table: copy.table,
          reason: compatibility.reason,
          unsupported_source_columns: compatibility.unsupportedSourceColumns,
          required_target_columns: compatibility.requiredTargetColumns,
        });
        copyBlock = { replay: false, mode: 'skip', relation };
        continue;
      }

      if (compatibility.mode === 'project') {
        projected.push({
          schema: copy.schema,
          table: copy.table,
          reason: compatibility.reason,
          dropped_source_columns: compatibility.unsupportedSourceColumns,
          replayed_columns: compatibility.replayColumns,
        });
        output.write(`${buildCopyHeader(copy, compatibility.replayColumns)}\n`);
      } else {
        output.write(`${line}\n`);
      }

      copyBlock = {
        replay: true,
        mode: compatibility.mode,
        relation,
        sourceColumnCount: copy.columns.length,
        replayColumnIndexes: compatibility.replayColumnIndexes,
      };
      replayedCopyBlocks += 1;
      if (applicationOwned) {
        replayedApplication.add(relation);
      } else {
        replayedProvider.add(relation);
        replayedProviderBlocks.push({
          schema: copy.schema,
          table: copy.table,
          mode: compatibility.mode,
          replayed_columns: compatibility.replayColumns,
          dropped_source_columns: compatibility.unsupportedSourceColumns,
        });
      }
    }

    if (copyBlock) throw new Error(`COPY block missing terminator: ${copyBlock.relation}`);
    output.end();
    await finished(output);
  } catch (error) {
    reader.close();
    output.destroy();
    throw error;
  }

  const report = {
    schema_version: 'myeongha-postgres-portable-data-replay-v2',
    application_schema_policy: 'public-fail-closed',
    provider_schema_policy: 'target-compatible-column-projection',
    source_copy_blocks: sourceCopyBlocks,
    replayed_copy_blocks: replayedCopyBlocks,
    replayed_application_relations: [...replayedApplication].sort(),
    replayed_provider_relations: [...replayedProvider].sort(),
    replayed_provider_copy_blocks: replayedProviderBlocks,
    projected_provider_copy_blocks: projected,
    skipped_provider_copy_blocks: skipped,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await transformPortableDataReplay({
    inputPath: args.get('--input'),
    outputPath: args.get('--output'),
    targetCatalogPath: args.get('--target-catalog'),
    reportPath: args.get('--report'),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
