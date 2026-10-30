'use client';

import React from 'react';
import { Check, ExternalLink, Quote } from 'lucide-react';
import {
  parseSafeMarkdownBlocks,
  tokenizeInlineMarkdown,
  type InlineMarkdownToken,
} from '@/lib/notes/note-utils';

interface SafeMarkdownRendererProps {
  content: string;
  onToggleChecklistLine?: (lineIndex: number) => void;
}

function renderInlineTokens(tokens: InlineMarkdownToken[]): React.ReactNode {
  return tokens.map((token, idx) => {
    if (token.type === 'bold') {
      return (
        <strong key={idx} className="font-semibold text-[#171622]">
          {token.text}
        </strong>
      );
    }
    if (token.type === 'italic') {
      return (
        <em key={idx} className="italic text-[#171622]/90">
          {token.text}
        </em>
      );
    }
    if (token.type === 'code') {
      return (
        <code
          key={idx}
          className="rounded-md bg-[#171622]/6 px-1.5 py-0.5 font-mono text-xs text-[#5938B5]"
        >
          {token.text}
        </code>
      );
    }
    if (token.type === 'link') {
      const isExternal =
        token.href.startsWith('http://') || token.href.startsWith('https://');
      return (
        <a
          key={idx}
          href={token.href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="inline-flex items-center gap-0.5 font-medium text-[#5938B5] underline underline-offset-4 hover:text-[#171622]"
        >
          <span>{token.text}</span>
          {isExternal && (
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
        </a>
      );
    }
    return <React.Fragment key={idx}>{token.text}</React.Fragment>;
  });
}

export default function SafeMarkdownRenderer({
  content,
  onToggleChecklistLine,
}: SafeMarkdownRendererProps) {
  const blocks = parseSafeMarkdownBlocks(content);

  if (blocks.length === 0) {
    return (
      <p className="text-sm italic text-[#171622]/45">
        No content written yet. Click Edit to start writing in Markdown.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed text-[#171622]/85">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h2
                key={index}
                className="font-display text-lg font-bold text-[#171622] pt-2"
              >
                {renderInlineTokens(tokenizeInlineMarkdown(block.text))}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3
                key={index}
                className="font-display text-base font-bold text-[#171622] pt-1.5"
              >
                {renderInlineTokens(tokenizeInlineMarkdown(block.text))}
              </h3>
            );
          }
          return (
            <h4
              key={index}
              className="font-display text-sm font-bold text-[#171622] pt-1"
            >
              {renderInlineTokens(tokenizeInlineMarkdown(block.text))}
            </h4>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={index} className="leading-relaxed text-[#171622]/85">
              {renderInlineTokens(tokenizeInlineMarkdown(block.text))}
            </p>
          );
        }

        if (block.type === 'ordered_list') {
          return (
            <ol
              key={index}
              className="list-decimal pl-5 space-y-1.5 text-[#171622]/85 marker:font-semibold marker:text-[#171622]/70"
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="pl-1">
                  {renderInlineTokens(tokenizeInlineMarkdown(item))}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'bullet_list') {
          return (
            <ul
              key={index}
              className="list-disc pl-5 space-y-1.5 text-[#171622]/85 marker:text-[#5938B5]"
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="pl-1">
                  {renderInlineTokens(tokenizeInlineMarkdown(item))}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'checklist') {
          return (
            <ul key={index} className="space-y-2">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onToggleChecklistLine?.(item.lineIndex)}
                    disabled={!onToggleChecklistLine}
                    aria-label={
                      item.checked
                        ? `Uncheck '${item.text}'`
                        : `Check '${item.text}'`
                    }
                    className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622] ${
                      item.checked
                        ? 'border-[#5C9E31] bg-[#78C247] text-white'
                        : 'border-[#171622]/30 bg-white hover:border-[#171622]'
                    }`}
                  >
                    {item.checked && (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                  <span
                    className={
                      item.checked
                        ? 'line-through text-[#171622]/50'
                        : 'text-[#171622]/85'
                    }
                  >
                    {renderInlineTokens(tokenizeInlineMarkdown(item.text))}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={index}
              className="rounded-2xl bg-[#F4F1FC] border border-[#5938B5]/12 p-4 space-y-2"
            >
              <div className="flex items-start gap-3">
                <Quote
                  className="h-5 w-5 shrink-0 text-[#7C5CE6]/70 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1.5 min-w-0">
                  {block.lines.map((line, lIdx) => (
                    <p
                      key={lIdx}
                      className="text-sm font-medium italic text-[#3E2780] leading-relaxed"
                    >
                      {renderInlineTokens(tokenizeInlineMarkdown(line))}
                    </p>
                  ))}
                  {block.attribution && (
                    <footer className="text-xs font-medium text-[#5938B5]/80">
                      — {block.attribution}
                    </footer>
                  )}
                </div>
              </div>
            </blockquote>
          );
        }

        if (block.type === 'code_block') {
          return (
            <div
              key={index}
              className="rounded-xl border border-[#171622]/10 bg-[#171622] text-[#FAF9F6] p-3.5 overflow-x-auto"
            >
              {block.language && (
                <div className="mb-1.5 text-[11px] font-mono text-[#FAF9F6]/55">
                  {block.language}
                </div>
              )}
              <pre className="font-mono text-xs leading-relaxed">
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'divider') {
          return <hr key={index} className="border-t border-[#171622]/10 my-4" />;
        }

        return null;
      })}
    </div>
  );
}
