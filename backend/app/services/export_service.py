"""
Export Service — Revolutionary Feature #3
Export scans to Markdown, Notion format, Obsidian, PDF, JSON.
"""

import io
import json
from datetime import datetime


class ExportService:
    async def export(
        self,
        scan: dict,
        format: str,
        options: dict,
    ) -> tuple[str | bytes, str]:
        """Returns (content, filename). Content is bytes for PDF, str otherwise."""
        if format == 'markdown':
            return self._to_markdown(scan, options), f'lensai-{scan["id"][:8]}.md'
        elif format == 'notion':
            return self._to_notion(scan, options), f'lensai-{scan["id"][:8]}-notion.md'
        elif format == 'obsidian':
            return self._to_obsidian(scan, options), f'lensai-{scan["id"][:8]}.md'
        elif format == 'json':
            return json.dumps(scan, indent=2), f'lensai-{scan["id"][:8]}.json'
        elif format == 'pdf':
            return self._to_pdf(scan, options), f'lensai-{scan["id"][:8]}.pdf'
        else:
            return self._to_markdown(scan, options), f'lensai-{scan["id"][:8]}.md'

    def _to_markdown(self, scan: dict, options: dict) -> str:
        ts = datetime.fromtimestamp(scan.get('timestamp', 0) / 1000)
        lines = [
            f'# LensAI Scan — {scan.get("content_type", "").replace("-", " ").title()}',
            f'',
            f'**Date**: {ts.strftime("%Y-%m-%d %H:%M")}',
            f'**Mode**: {scan.get("mode", "technical")}',
            f'**Domain**: {scan.get("domain", "")}',
            f'**Confidence**: {round(scan.get("confidence", 0) * 100)}%',
            f'',
            f'---',
            f'',
            f'## Explanation',
            f'',
            scan.get('explanation', ''),
        ]

        if options.get('includeMetadata') and scan.get('key_points'):
            lines += ['', '## Key Points', '']
            for point in scan['key_points']:
                lines.append(f'- {point}')

        if options.get('includeLearningPaths') and scan.get('suggested_learning_paths'):
            lines += ['', '## Learning Paths', '']
            for path in scan['suggested_learning_paths']:
                lines.append(f'### {path["title"]}')
                lines.append(f'*{path["description"]}* — {path["estimated_time"]}')
                lines += ['']
                for resource in path.get('resources', []):
                    lines.append(f'- [{resource["title"]}]({resource["url"]}) ({resource["platform"]})')

        return '\n'.join(lines)

    def _to_notion(self, scan: dict, options: dict) -> str:
        """Notion-compatible markdown (with callouts and database properties)."""
        ts = datetime.fromtimestamp(scan.get('timestamp', 0) / 1000)
        lines = [
            f'# {scan.get("content_type", "").replace("-", " ").title()} Analysis',
            f'',
            f'> [!info] LensAI Scan',
            f'> **Date**: {ts.strftime("%Y-%m-%d")} | **Mode**: {scan.get("mode")} | **Source**: {scan.get("domain")}',
            f'',
            scan.get('explanation', ''),
        ]

        if scan.get('key_points'):
            lines += ['', '## 📌 Key Points', '']
            for point in scan['key_points']:
                lines.append(f'- [ ] {point}')

        return '\n'.join(lines)

    def _to_obsidian(self, scan: dict, options: dict) -> str:
        """Obsidian-compatible markdown with YAML frontmatter and wiki-links."""
        ts = datetime.fromtimestamp(scan.get('timestamp', 0) / 1000)
        tags = scan.get('tags', [scan.get('content_type', 'lensai')])

        lines = [
            '---',
            f'date: {ts.strftime("%Y-%m-%d")}',
            f'tags: [{", ".join(tags)}]',
            f'source: {scan.get("domain", "")}',
            f'type: lensai-scan',
            f'content_type: {scan.get("content_type")}',
            '---',
            f'',
            f'# {scan.get("content_type", "").replace("-", " ").title()} — {ts.strftime("%Y-%m-%d")}',
            f'',
            f'Source: [[{scan.get("domain", "web")}]]',
            f'',
            scan.get('explanation', ''),
        ]

        if scan.get('key_points'):
            lines += ['', '## Key Points', '']
            for point in scan['key_points']:
                lines.append(f'- {point}')

        return '\n'.join(lines)

    def _to_pdf(self, scan: dict, options: dict) -> bytes:
        """Render scan to PDF using WeasyPrint."""
        from weasyprint import HTML as WeasyprintHTML

        ts = datetime.fromtimestamp(scan.get('timestamp', 0) / 1000)
        content_type_label = scan.get('content_type', 'unknown').replace('-', ' ').title()
        explanation = scan.get('explanation', '').replace('\n', '<br>')

        key_points_html = ''
        if options.get('includeMetadata') and scan.get('key_points'):
            items = ''.join(f'<li>{p}</li>' for p in scan['key_points'])
            key_points_html = f'<h2>Key Points</h2><ul>{items}</ul>'

        learning_html = ''
        if options.get('includeLearningPaths') and scan.get('suggested_learning_paths'):
            paths = scan['suggested_learning_paths']
            path_items = ''
            for p in paths:
                resources = ''.join(
                    f'<li><a href="{r["url"]}">{r["title"]}</a> — {r.get("platform","")}</li>'
                    for r in p.get('resources', [])
                )
                path_items += f'<h3>{p["title"]}</h3><p>{p.get("description","")}</p><ul>{resources}</ul>'
            learning_html = f'<h2>Learning Paths</h2>{path_items}'

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         margin: 40px; color: #1a1a2e; line-height: 1.6; }}
  h1   {{ color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 8px; }}
  h2   {{ color: #4c1d95; margin-top: 24px; }}
  .meta {{ background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 12px 16px;
           border-radius: 4px; margin-bottom: 24px; font-size: 14px; }}
  .explanation {{ white-space: pre-wrap; }}
  a    {{ color: #7c3aed; }}
  li   {{ margin-bottom: 4px; }}
</style>
</head>
<body>
  <h1>LensAI — {content_type_label} Analysis</h1>
  <div class="meta">
    <strong>Date:</strong> {ts.strftime('%Y-%m-%d %H:%M')} &nbsp;|&nbsp;
    <strong>Domain:</strong> {scan.get('domain', scan.get('page_domain', '—'))} &nbsp;|&nbsp;
    <strong>Confidence:</strong> {round(scan.get('confidence', 0) * 100)}%
  </div>
  <h2>Analysis</h2>
  <div class="explanation">{explanation}</div>
  {key_points_html}
  {learning_html}
</body>
</html>"""

        pdf_bytes_io = io.BytesIO()
        WeasyprintHTML(string=html_content).write_pdf(pdf_bytes_io)
        return pdf_bytes_io.getvalue()
