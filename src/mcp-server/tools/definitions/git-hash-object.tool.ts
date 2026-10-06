/**
 * @fileoverview Git hash-object tool - compute the hash of a blob or tree object
 * @module mcp-server/tools/definitions/git-hash-object
 */
import { z } from 'zod';

import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema } from '../schemas/common.js';
import type { ToolDefinition } from '../utils/toolDefinition.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_hash_object';
const TOOL_TITLE = 'Git Hash Object';
const TOOL_DESCRIPTION =
  'Compute the object name (hash) of a given content or file using git hash-object. Supports stdin input, custom object types, and SHA-256 hashing.';

const InputSchema = z
  .object({
    path: PathSchema,
    file: z
      .string()
      .min(1)
      .describe(
        'Path to the file to hash (relative to repository root). Must not start with "-".',
      )
      .optional(),
    object: z
      .string()
      .describe('Blob object content to hash (read from stdin if not provided).')
      .optional(),
    algo: z
      .enum(['sha1', 'sha256'])
      .default('sha1')
      .describe('Hash algorithm to use (default: sha1).'),
    write: z
      .boolean()
      .default(false)
      .describe(
        'Write the object to the object database, but do not commit (default: false).',
      ),
    literally: z
      .boolean()
      .default(false)
      .describe(
        'Read raw content from file; do not attempt to strip whitespaces (default: false).',
      ),
    verify: z
      .boolean()
      .default(false)
      .describe(
        'Verify the object is valid (default: false).',
      ),
    force: z
      .boolean()
      .default(false)
      .describe(
        'Force operation even if it would overwrite existing objects (default: false).',
      ),
  })
  .strict()
  .refine(
    (data) => data.file !== undefined || data.object !== undefined,
    {
      message: 'Either file or object must be provided.',
      path: ['file'],
    },
  );

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  hash: z.string().describe('The computed object hash (SHA-1 or SHA-256).'),
  objectType: z.string().describe('The object type (e.g., "blob").'),
  rawOutput: z.string().optional().describe('Raw git output.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;

async function gitHashObjectLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  const hashObjectOptions: Parameters<typeof provider.hashObject>[0] = {};

  if (input.file !== undefined) {
    hashObjectOptions.path = input.file;
  }
  if (input.object !== undefined) {
    hashObjectOptions.object = input.object;
  }
  hashObjectOptions.algorithm = input.algo;
  hashObjectOptions.write = input.write;
  hashObjectOptions.literally = input.literally;
  hashObjectOptions.verify = input.verify;
  hashObjectOptions.force = input.force;

  const result = await provider.hashObject(hashObjectOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    hash: result.hash,
    objectType: result.objectType ?? 'blob',
    rawOutput: result.rawOutput,
  };
}

/**
 * Filter git_hash_object output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success and hash only
 * - standard: Above + object type (RECOMMENDED)
 * - full: Complete output including rawOutput
 */
function filterGitHashObjectOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  if (level === 'minimal') {
    return {
      success: result.success,
      hash: result.hash,
    };
  }
  if (level === 'standard') {
    return {
      success: result.success,
      hash: result.hash,
      objectType: result.objectType,
    };
  }
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitHashObjectOutput,
});

export const gitHashObjectTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: { readOnlyHint: true },
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitHashObjectLogic)),
  responseFormatter,
};
