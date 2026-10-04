import unittest

from app.utils.response_format import convert_fenced_code_blocks


class ResponseFormatTests(unittest.TestCase):
    def test_converts_fenced_code_to_semantic_html(self):
        actual = convert_fenced_code_blocks("```python\nprint('<hello>')\n```")

        self.assertEqual(
            actual,
            '<pre><code class="language-python">print(&#x27;&lt;hello&gt;&#x27;)</code></pre>',
        )

    def test_removes_unsafe_language_characters(self):
        actual = convert_fenced_code_blocks("```js<script>\nconst value = 1;\n```")

        self.assertEqual(actual, '<pre><code class="language-jsscript">const value = 1;</code></pre>')

    def test_leaves_plain_content_unchanged(self):
        self.assertEqual(convert_fenced_code_blocks("A normal answer."), "A normal answer.")


if __name__ == "__main__":
    unittest.main()
