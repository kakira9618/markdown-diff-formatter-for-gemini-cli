#!/usr/bin/env node

const fs = require('fs');

/**
 * Parses markdown and finds all diff blocks using a context-free grammar approach
 * Returns array of objects containing block information
 */
function findDiffBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let state = 'OUTSIDE'; // OUTSIDE | IN_DIFF_BLOCK
  let currentBlock = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (state === 'OUTSIDE') {
      // Check if this line starts a diff block
      const match = line.match(/^(\s*)```diff$/);
      if (match) {
        const leadingSpaces = match[1];
        const indentLevel = leadingSpaces.length;

        currentBlock = {
          startLine: i,
          endLine: null,
          indentLevel: indentLevel,
          lines: [line]
        };
        state = 'IN_DIFF_BLOCK';
      }
    } else if (state === 'IN_DIFF_BLOCK') {
      currentBlock.lines.push(line);

      // Check if this line ends the diff block
      const match = line.match(/^(\s*)```$/);
      if (match) {
        currentBlock.endLine = i;
        blocks.push(currentBlock);
        currentBlock = null;
        state = 'OUTSIDE';
      }
    }
  }

  return blocks;
}

/**
 * Determines if a line is a diff header (should not be counted for min indent)
 * Diff headers are lines starting with: diff, ---, +++, @@, or index
 */
function isDiffHeader(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('diff ') ||
         trimmed.startsWith('---') ||
         trimmed.startsWith('+++') ||
         trimmed.startsWith('@@') ||
         trimmed.startsWith('index ');
}

/**
 * Calculates the minimum indent level of code body lines in a diff block
 * (excluding the opening/closing ``` lines and diff headers)
 */
function calculateMinCodeIndent(blockLines) {
  let minIndent = Infinity;

  // Skip first line (```diff) and last line (```)
  for (let i = 1; i < blockLines.length - 1; i++) {
    const line = blockLines[i];

    // Skip empty lines
    if (line.trim().length === 0) {
      continue;
    }

    // Skip diff headers
    if (isDiffHeader(line)) {
      continue;
    }

    // Count leading spaces
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    minIndent = Math.min(minIndent, leadingSpaces);
  }

  return minIndent === Infinity ? 0 : minIndent;
}

/**
 * Formats a single diff block by adjusting indentation
 */
function formatDiffBlock(blockLines, blockIndent) {
  const minCodeIndent = calculateMinCodeIndent(blockLines);
  const spacesToAdd = Math.max(blockIndent - minCodeIndent, 0);
  const prefix = ' '.repeat(spacesToAdd);

  const formattedLines = [];

  // Keep first line (```diff) as is
  formattedLines.push(blockLines[0]);

  // Add spacing to code body lines (excluding last line which is ```)
  for (let i = 1; i < blockLines.length - 1; i++) {
    const line = blockLines[i];
    if (line.trim().length === 0) {
      // Keep empty lines as empty
      formattedLines.push(line);
    } else {
      formattedLines.push(prefix + line);
    }
  }

  // Keep last line (```) as is
  formattedLines.push(blockLines[blockLines.length - 1]);

  return formattedLines;
}

/**
 * Main function to format markdown with diff blocks
 */
function formatMarkdown(markdown) {
  const lines = markdown.split('\n');
  const blocks = findDiffBlocks(markdown);

  if (blocks.length === 0) {
    return markdown;
  }

  // Build output by replacing each block with its formatted version
  const result = [];
  let currentLine = 0;

  for (const block of blocks) {
    // Add lines before this block
    for (let i = currentLine; i < block.startLine; i++) {
      result.push(lines[i]);
    }

    // Add formatted block
    const formattedBlock = formatDiffBlock(block.lines, block.indentLevel);
    result.push(...formattedBlock);

    currentLine = block.endLine + 1;
  }

  // Add remaining lines after the last block
  for (let i = currentLine; i < lines.length; i++) {
    result.push(lines[i]);
  }

  return result.join('\n');
}

/**
 * Main entry point - reads from stdin and writes to stdout
 */
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
      input += chunk;
    }
  });

  process.stdin.on('end', () => {
    const formatted = formatMarkdown(input);
    process.stdout.write(formatted);
  });
}

// Run main function
main();
