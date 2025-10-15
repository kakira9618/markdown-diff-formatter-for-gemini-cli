#!/usr/bin/env node

/**
 * Markdown内のdiffブロックを整形するプログラム
 * 標準入力からMarkdownを受け取り、diffブロック内の-/+行を整形して標準出力に出力
 */

const fs = require('fs');

/**
 * 文脈自由文法的にdiffブロックを解析するパーサー
 */
class DiffBlockParser {
  constructor(content) {
    this.content = content;
    this.pos = 0;
    this.blocks = [];
  }

  /**
   * 現在位置の文字を取得
   */
  peek() {
    return this.content[this.pos];
  }

  /**
   * 現在位置から指定文字数分の文字列を取得
   */
  peekN(n) {
    return this.content.substr(this.pos, n);
  }

  /**
   * 現在位置を進める
   */
  advance(n = 1) {
    this.pos += n;
  }

  /**
   * EOFチェック
   */
  isEOF() {
    return this.pos >= this.content.length;
  }

  /**
   * 空白文字をスキップし、その数を返す
   */
  consumeSpaces() {
    let count = 0;
    const maxSpaces = this.content.length; // 無限ループ対策
    while (!this.isEOF() && this.peek() === ' ' && count < maxSpaces) {
      count++;
      this.advance();
    }
    return count;
  }

  /**
   * 改行までスキップ
   */
  skipToNewline() {
    const startPos = this.pos;
    while (!this.isEOF() && this.peek() !== '\n') {
      this.advance();
      // 無限ループ対策: 位置が進んでいない場合は強制終了
      if (this.pos === startPos) {
        throw new Error('Internal error: Position not advancing in skipToNewline');
      }
    }
    if (!this.isEOF() && this.peek() === '\n') {
      this.advance();
    }
  }

  /**
   * 指定文字列とマッチするかチェックして消費
   */
  consume(str) {
    if (this.peekN(str.length) === str) {
      this.advance(str.length);
      return true;
    }
    return false;
  }

  /**
   * diffブロックの開始をパース
   * Grammar: DiffBlockStart -> Spaces "```diff" Newline
   */
  parseDiffBlockStart() {
    const startPos = this.pos;
    const indentLevel = this.consumeSpaces();

    if (this.consume('```diff')) {
      // 改行までスキップ（```diffの後に何か文字がある場合も許容）
      this.skipToNewline();
      return { success: true, indentLevel, startPos };
    }

    // マッチしなかった場合は位置を戻す
    this.pos = startPos;
    return { success: false };
  }

  /**
   * diffブロックの終了をパース
   * Grammar: DiffBlockEnd -> Spaces "```" (Newline | EOF)
   */
  parseDiffBlockEnd() {
    const startPos = this.pos;
    this.consumeSpaces();

    if (this.consume('```')) {
      const afterBackticks = this.pos;
      // 改行またはEOFであることを確認
      if (this.isEOF() || this.peek() === '\n') {
        if (this.peek() === '\n') {
          this.advance();
        }
        return { success: true };
      }
    }

    // マッチしなかった場合は位置を戻す
    this.pos = startPos;
    return { success: false };
  }

  /**
   * diffブロック内のコンテンツをパース
   */
  parseDiffBlockContent(startPos, endPos) {
    return this.content.substring(startPos, endPos);
  }

  /**
   * 全体をパースしてdiffブロックを抽出
   * Grammar:
   *   Document -> (Text | DiffBlock)*
   *   DiffBlock -> DiffBlockStart Content DiffBlockEnd
   */
  parse() {
    const maxIterations = this.content.length * 2; // 無限ループ対策
    let iterations = 0;

    while (!this.isEOF()) {
      if (++iterations > maxIterations) {
        throw new Error('Parse error: Maximum iterations exceeded (possible infinite loop)');
      }

      const beforePos = this.pos;
      const blockStart = this.parseDiffBlockStart();

      if (blockStart.success) {
        // diffブロックの内容の開始位置
        const contentStartPos = this.pos;
        let innerIterations = 0;

        // 終了タグを探す
        while (!this.isEOF()) {
          if (++innerIterations > maxIterations) {
            throw new Error('Parse error: Maximum iterations exceeded while searching for block end');
          }

          const innerBeforePos = this.pos;
          const blockEnd = this.parseDiffBlockEnd();

          if (blockEnd.success) {
            // diffブロックが見つかった
            const contentEndPos = this.pos - (this.content[this.pos - 1] === '\n' ? 4 : 3); // ```の前まで

            // ```の前の空白を除去するため、さらに調整
            let adjustedEndPos = contentEndPos;
            while (adjustedEndPos > contentStartPos && this.content[adjustedEndPos - 1] === ' ') {
              adjustedEndPos--;
            }
            // 改行の前まで戻る
            while (adjustedEndPos > contentStartPos && this.content[adjustedEndPos - 1] !== '\n') {
              adjustedEndPos--;
            }

            this.blocks.push({
              fullStartPos: blockStart.startPos,
              fullEndPos: this.pos,
              contentStartPos: contentStartPos,
              contentEndPos: adjustedEndPos,
              indentLevel: blockStart.indentLevel
            });
            break;
          }

          // 終了タグでなければ、次の行へ
          this.skipToNewline();

          // 無限ループ対策: 位置が進んでいることを確認
          if (this.pos === innerBeforePos && !this.isEOF()) {
            throw new Error('Parse error: Position not advancing in inner loop');
          }
        }
      } else {
        // diffブロックでなければ1文字進む
        this.advance();
      }

      // 無限ループ対策: 位置が進んでいることを確認
      if (this.pos === beforePos && !this.isEOF()) {
        throw new Error('Parse error: Position not advancing in outer loop');
      }
    }

    return this.blocks;
  }
}

/**
 * diffブロックの内容を整形
 */
function formatDiffBlock(content, indentLevel) {
  // 入力の妥当性チェック
  if (typeof content !== 'string') {
    throw new TypeError('formatDiffBlock: content must be a string');
  }
  if (typeof indentLevel !== 'number' || indentLevel < 0) {
    throw new TypeError('formatDiffBlock: indentLevel must be a non-negative number');
  }
  if (indentLevel > 1000) {
    throw new RangeError('formatDiffBlock: indentLevel too large (max 1000)');
  }

  const lines = content.split('\n');
  const formattedLines = lines.map((line, index) => {
    // -または+で始まる行を処理
    if (line.startsWith('-') || line.startsWith('+')) {
      const prefix = line[0]; // '-' or '+'
      const rest = line.substring(1);

      // インデントレベル分の空白を追加
      const indent = ' '.repeat(indentLevel);

      // +または-の後の空白を削除（インデントレベル分だけ）
      let spacesToRemove = indentLevel;
      let contentStartIdx = 0;

      while (spacesToRemove > 0 && contentStartIdx < rest.length && rest[contentStartIdx] === ' ') {
        spacesToRemove--;
        contentStartIdx++;
      }

      return indent + prefix + rest.substring(contentStartIdx);
    }
    return line;
  });

  return formattedLines.join('\n');
}

/**
 * Markdown全体を整形
 */
function formatMarkdown(markdown) {
  // 入力の妥当性チェック
  if (typeof markdown !== 'string') {
    throw new TypeError('formatMarkdown: input must be a string');
  }

  // 入力サイズの制限チェック（メモリ対策）
  const MAX_INPUT_SIZE = 100 * 1024 * 1024; // 100MB
  if (markdown.length > MAX_INPUT_SIZE) {
    throw new RangeError(`formatMarkdown: input too large (max ${MAX_INPUT_SIZE} bytes)`);
  }

  try {
    const parser = new DiffBlockParser(markdown);
    const blocks = parser.parse();

    if (blocks.length === 0) {
      return markdown;
    }

    // ブロックの位置が有効かチェック
    for (const block of blocks) {
      if (block.contentStartPos < 0 || block.contentEndPos > markdown.length ||
          block.contentStartPos > block.contentEndPos) {
        throw new Error('formatMarkdown: Invalid block position detected');
      }
    }

    // 後ろから置換していく（位置がずれないように）
    let result = markdown;

    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      const originalContent = markdown.substring(block.contentStartPos, block.contentEndPos);
      const formattedContent = formatDiffBlock(originalContent, block.indentLevel);

      result =
        result.substring(0, block.contentStartPos) +
        formattedContent +
        result.substring(block.contentEndPos);
    }

    return result;
  } catch (error) {
    // パースエラーの場合は元の入力を返す（フェイルセーフ）
    if (error.message.startsWith('Parse error:')) {
      console.error('Warning: Parse error occurred, returning original input:', error.message);
      return markdown;
    }
    // その他のエラーは再スロー
    throw error;
  }
}

/**
 * メイン処理
 */
function main() {
  // 標準入力から読み込み
  let input = '';
  const MAX_STDIN_SIZE = 100 * 1024 * 1024; // 100MB

  if (process.stdin.isTTY) {
    console.error('Error: This program reads from stdin. Usage: cat file.md | node format-diff.js');
    process.exit(1);
  }

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (chunk) => {
    input += chunk;

    // 入力サイズチェック
    if (input.length > MAX_STDIN_SIZE) {
      console.error(`Error: Input size exceeds maximum allowed size (${MAX_STDIN_SIZE} bytes)`);
      process.exit(1);
    }
  });

  process.stdin.on('end', () => {
    try {
      const formatted = formatMarkdown(input);
      process.stdout.write(formatted);
    } catch (error) {
      console.error('Error:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

  process.stdin.on('error', (error) => {
    console.error('Error reading from stdin:', error.message);
    process.exit(1);
  });
}

// プログラム実行
try {
  main();
} catch (error) {
  console.error('Fatal error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
