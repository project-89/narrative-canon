"use client";

import { Fragment, type ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;
const INLINE_TOKEN_REGEX = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  if (!text) return nodes;

  const matches = Array.from(text.matchAll(INLINE_TOKEN_REGEX));
  if (matches.length === 0) {
    return [text];
  }

  let cursor = 0;
  matches.forEach((match, index) => {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(
        <Fragment key={`${keyPrefix}_plain_${index}`}>
          {text.slice(cursor, start)}
        </Fragment>
      );
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}_bold_${index}`} className="font-semibold text-gray-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}_code_${index}`}
          className="px-1.5 py-0.5 rounded bg-black/35 text-cyan-200 text-[0.9em] font-mono"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`${keyPrefix}_italic_${index}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      const link = token.match(LINK_PATTERN);
      if (link) {
        const [, label, href] = link;
        const isExternal = /^https?:\/\//i.test(href);
        nodes.push(
          <a
            key={`${keyPrefix}_link_${index}`}
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noreferrer noopener" : undefined}
            className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
          >
            {label}
          </a>
        );
      } else {
        nodes.push(<Fragment key={`${keyPrefix}_token_${index}`}>{token}</Fragment>);
      }
    }

    cursor = start + token.length;
  });

  if (cursor < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}_tail`}>
        {text.slice(cursor)}
      </Fragment>
    );
  }

  return nodes;
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const blocks = useMemo(() => {
    const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
    const rendered: ReactNode[] = [];
    let i = 0;
    let blockKey = 0;

    const isBullet = (line: string) => /^[-*]\s+/.test(line);
    const isOrdered = (line: string) => /^\d+\.\s+/.test(line);
    const isHeading = (line: string) => /^#{1,6}\s+/.test(line);
    const isBlockQuote = (line: string) => /^>\s?/.test(line);
    const isCodeFence = (line: string) => /^```/.test(line.trim());

    while (i < lines.length) {
      const rawLine = lines[i];
      const line = rawLine ?? "";

      if (line.trim().length === 0) {
        i += 1;
        continue;
      }

      if (isCodeFence(line)) {
        const startFence = line.trim();
        const language = startFence.replace(/```/, "").trim();
        i += 1;
        const codeLines: string[] = [];
        while (i < lines.length && !isCodeFence(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        rendered.push(
          <pre
            key={`md_code_${blockKey++}`}
            className="overflow-x-auto rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-cyan-100"
          >
            {language && <div className="mb-1 text-[10px] uppercase tracking-wide text-cyan-300/80">{language}</div>}
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const sizeClass =
          level <= 2 ? "text-base font-semibold" :
          level === 3 ? "text-sm font-semibold" :
          "text-xs font-semibold uppercase tracking-wide";
        rendered.push(
          <p key={`md_heading_${blockKey++}`} className={cn(sizeClass, "text-gray-100")}>
            {renderInlineMarkdown(text, `heading_${blockKey}`)}
          </p>
        );
        i += 1;
        continue;
      }

      if (isBlockQuote(line)) {
        const quoteLines: string[] = [];
        while (i < lines.length && isBlockQuote(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, "").trim());
          i += 1;
        }
        rendered.push(
          <blockquote
            key={`md_quote_${blockKey++}`}
            className="border-l-2 border-cyan-400/40 pl-3 text-gray-300/90 italic"
          >
            {renderInlineMarkdown(quoteLines.join(" "), `quote_${blockKey}`)}
          </blockquote>
        );
        continue;
      }

      if (isBullet(line)) {
        const bulletItems: string[] = [];
        while (i < lines.length && isBullet(lines[i])) {
          bulletItems.push(lines[i].replace(/^[-*]\s+/, "").trim());
          i += 1;
        }
        rendered.push(
          <ul key={`md_ul_${blockKey++}`} className="list-disc list-inside space-y-1 text-inherit">
            {bulletItems.map((item, itemIdx) => (
              <li key={`md_ul_item_${blockKey}_${itemIdx}`} className="text-sm leading-relaxed">
                {renderInlineMarkdown(item, `ul_${blockKey}_${itemIdx}`)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (isOrdered(line)) {
        const orderedItems: string[] = [];
        while (i < lines.length && isOrdered(lines[i])) {
          orderedItems.push(lines[i].replace(/^\d+\.\s+/, "").trim());
          i += 1;
        }
        rendered.push(
          <ol key={`md_ol_${blockKey++}`} className="list-decimal list-inside space-y-1 text-inherit">
            {orderedItems.map((item, itemIdx) => (
              <li key={`md_ol_item_${blockKey}_${itemIdx}`} className="text-sm leading-relaxed">
                {renderInlineMarkdown(item, `ol_${blockKey}_${itemIdx}`)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      const paragraphLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim().length > 0 &&
        !isHeading(lines[i]) &&
        !isBullet(lines[i]) &&
        !isOrdered(lines[i]) &&
        !isBlockQuote(lines[i]) &&
        !isCodeFence(lines[i])
      ) {
        paragraphLines.push(lines[i].trim());
        i += 1;
      }

      rendered.push(
        <p key={`md_p_${blockKey++}`} className="text-sm leading-relaxed text-inherit">
          {renderInlineMarkdown(paragraphLines.join(" "), `p_${blockKey}`)}
        </p>
      );
    }

    return rendered;
  }, [content]);

  return <div className={cn("space-y-2", className)}>{blocks}</div>;
}
