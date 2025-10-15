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
    while (!this.isEOF() && this.peek() === ' ') {
      count++;
      this.advance();
    }
    return count;
  }

  /**
   * 改行までスキップ
   */
  skipToNewline() {
    while (!this.isEOF() && this.peek() !== '\n') {
      this.advance();
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
    while (!this.isEOF()) {
      const blockStart = this.parseDiffBlockStart();

      if (blockStart.success) {
        // diffブロックの内容の開始位置
        const contentStartPos = this.pos;

        // 終了タグを探す
        while (!this.isEOF()) {
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
        }
      } else {
        // diffブロックでなければ1文字進む
        this.advance();
      }
    }

    return this.blocks;
  }
}

/**
 * diffブロックの内容を整形
 */
function formatDiffBlock(content, indentLevel) {
  const lines = content.split('\n');
  const formattedLines = lines.map(line => {
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
  const parser = new DiffBlockParser(markdown);
  const blocks = parser.parse();

  if (blocks.length === 0) {
    return markdown;
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
}

/**
 * メイン処理
 */
function main() {
  // 標準入力から読み込み
  let input = '';

  if (process.stdin.isTTY) {
    console.error('Error: This program reads from stdin. Usage: cat file.md | node format-diff.js');
    process.exit(1);
  }

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (chunk) => {
    input += chunk;
  });

  process.stdin.on('end', () => {
    const formatted = formatMarkdown(input);
    process.stdout.write(formatted);
  });
}

// プログラム実行
main();
