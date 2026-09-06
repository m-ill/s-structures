export const MARKDOWN_RENDER_VERSION = 'p4-markdown-render-v1';

/**
 * docs/user-manual 마크다운을 브라우저 표시용 HTML 로 바꾸는 zero-dependency 렌더러.
 * 지원 범위는 실제 매뉴얼이 쓰는 부분집합으로 한정한다:
 * 제목(#~####), 표, 순서/비순서 목록, 코드 펜스, 인용, 수평선,
 * 인라인 `code` / **굵게** / *기울임* / [링크](url).
 * 원문 HTML 은 항상 이스케이프된다 (md 안의 <script> 등은 텍스트로 표시).
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInline(escapedText) {
  let out = escapedText;
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const safeHref = /^(https?:\/\/|\.\/|\.\.\/|#|\/)/.test(href) ? href : `#${href}`;
    return `<a href="${safeHref}">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,]|$)/g, '$1<em>$2</em>');
  return out;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line) {
  return /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

export function renderMarkdown(markdownText) {
  const lines = String(markdownText ?? '').replaceAll('\r\n', '\n').split('\n');
  const html = [];
  let index = 0;

  const paragraph = [];
  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
    paragraph.length = 0;
  }

  while (index < lines.length) {
    const line = lines[index];

    // 코드 펜스
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph();
      const language = fence[1] || '';
      const body = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1; // 닫는 펜스 소비
      html.push(`<pre><code${language ? ` data-lang="${escapeHtml(language)}"` : ''}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // 표
    if (isTableRow(line) && isTableSeparator(lines[index + 1] || '')) {
      flushParagraph();
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const thead = `<thead><tr>${headers.map((cell) => `<th>${renderInline(escapeHtml(cell))}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(escapeHtml(cell))}</td>`).join('')}</tr>`).join('')}</tbody>`;
      html.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // 제목
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`);
      index += 1;
      continue;
    }

    // 수평선
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      html.push('<hr>');
      index += 1;
      continue;
    }

    // 목록 (비순서/순서 — 연속 블록 단위)
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      flushParagraph();
      const ordered = !!olMatch;
      const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].match(pattern);
        if (!itemMatch) break;
        items.push(`<li>${renderInline(escapeHtml(itemMatch[1]))}</li>`);
        index += 1;
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    // 인용
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      const body = [];
      while (index < lines.length) {
        const quoteMatch = lines[index].match(/^>\s?(.*)$/);
        if (!quoteMatch) break;
        body.push(renderInline(escapeHtml(quoteMatch[1])));
        index += 1;
      }
      html.push(`<blockquote>${body.join('<br>')}</blockquote>`);
      continue;
    }

    // 빈 줄 = 문단 경계
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph();
  return html.join('\n');
}
