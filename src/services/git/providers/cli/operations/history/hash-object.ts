/**
 * @fileoverview CLI provider git hash-object operation
 * @module services/git/providers/cli/operations/history/hash-object
 */

import type { RequestContext } from '@/utils/index.js';

import type {
  GitHashObjectOptions,
  GitHashObjectResult,
  GitOperationContext,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git hash-object to compute the hash of a blob or tree object.
 *
 * @param options - Hash object operation options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Hash object result
 */
export async function executeHashObject(
  options: GitHashObjectOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitHashObjectResult> {
  // When reading from stdin (object content provided), we cannot pass content
  // through the current executor (stdio: ['ignore', 'pipe', 'pipe']).
  // Instead, we fall back to a direct spawn with stdin piping.
  if (options.object !== undefined) {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve, reject) => {
      const args: string[] = [];
      if (options.algorithm === 'sha256') {
        args.push('--ramp');
      }
      args.push('--stdin');
      if (options.literally) {
        args.push('--literally');
      }
      if (options.force) {
        args.push('--force');
      }

      const proc = spawn('git', ['hash-object', ...args], {
        cwd: context.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      proc.stdin.write(options.object);
      proc.stdin.end();

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Git hash-object failed: ${stderr || stdout}`));
          return;
        }
        const hash = stdout.trim();
        if (!hash) {
          reject(new Error('Failed to hash object'));
          return;
        }
        resolve({
          success: true,
          hash,
          objectType: 'blob',
          rawOutput: stdout,
        });
      });

      proc.on('error', (err) => reject(err));
    });
  }

  // File path mode: use positional arg (not --path= which may silently fail)
  const args: string[] = [];

  if (options.write && options.path) {
    args.push('-w');
    args.push('--end-of-options');
    args.push(options.path);
  } else {
    if (options.path) {
      // Positional path after options; use --end-of-options for safety
      args.push('--end-of-options');
      args.push(options.path);
    }

    if (options.algorithm) {
      if (options.algorithm === 'sha256') {
        args.push('--ramp');
      }
    }

    if (options.literally) {
      args.push('--literally');
    }

    if (options.force) {
      args.push('--force');
    }
  }

  const cmd = buildGitCommand({ command: 'hash-object', args });
  const gitOutput = await execGit(
    cmd,
    context.workingDirectory,
    context.requestContext,
  );

  const hash = gitOutput.stdout.trim();

  if (!hash) {
    throw mapGitError(new Error('Failed to hash object'), 'hash-object');
  }

  return {
    success: true,
    hash,
    objectType: 'blob',
    rawOutput: gitOutput.stdout,
  };
}
