"""Small, dependency-free helpers for formatting generated AI responses."""

import re
from html import escape


def convert_fenced_code_blocks(content: str) -> str:
    """Turn Markdown fences into safe semantic HTML without executing code."""
    def fenced_code_to_html(match: re.Match) -> str:
        language = re.sub(r"[^a-zA-Z0-9_-]", "", match.group(1) or "")
        code = escape(match.group(2).strip())
        language_class = f' class="language-{language}"' if language else ""
        return f"<pre><code{language_class}>{code}</code></pre>"

    return re.sub(
        r"```([^\n`]*)\n?(.*?)```",
        fenced_code_to_html,
        content,
        flags=re.DOTALL,
    )
