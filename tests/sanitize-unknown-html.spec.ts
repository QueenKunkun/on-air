import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { md } from '../src/markdown/renderer.js';

describe('sanitizeUnknownHtml', () => {
	it('wraps tool_result tags in collapsible details', () => {
		const input = '<tool_result>content here</tool_result>';
		const result = md.render(input);
		assert.ok(result.includes('<details class="onair-unknown-html"'), 'should have details class');
		assert.ok(result.includes('&lt;tool_result&gt;'), 'should have summary with tag name');
		assert.ok(result.includes('content here'), 'should preserve content');
	});

	it('wraps script tags in collapsible details', () => {
		const input = '<script src="/assets/index.js"></script>';
		const result = md.render(input);
		assert.ok(result.includes('<details class="onair-unknown-html"'), 'should have details class');
		assert.ok(result.includes('&lt;script&gt;'), 'should have summary');
	});

	it('wraps link tags in collapsible details', () => {
		const input = '<link rel="stylesheet" href="/assets/style.css">';
		const result = md.render(input);
		assert.ok(result.includes('<details class="onair-unknown-html"'), 'should have details class');
		assert.ok(result.includes('&lt;link&gt;'), 'should have summary');
	});

	it('preserves allowed tags', () => {
		const input = '<div>allowed content</div>';
		const result = md.render(input);
		assert.ok(result.includes('<div>allowed content</div>'), 'should preserve div tag');
		assert.ok(!result.includes('<details'), 'should not wrap in details');
	});

	it('preserves standard markdown tags', () => {
		const input = '<strong>bold</strong> and <em>italic</em>';
		const result = md.render(input);
		assert.ok(result.includes('<strong>bold</strong>'), 'should preserve strong tag');
		assert.ok(result.includes('<em>italic</em>'), 'should preserve em tag');
	});

	it('wraps self-closing unknown tags', () => {
		const input = '<toolUseResult />';
		const result = md.render(input);
		assert.ok(result.includes('<details class="onair-unknown-html"'), 'should have details class');
		assert.ok(result.includes('toolUseResult'), 'should mention tag name');
	});

	it('handles nested unknown tags', () => {
		const input = `<tool_result>
<retrieval_status>success</retrieval_status>
<task_id>123</task_id>
</tool_result>`;
		const result = md.render(input);
		assert.ok(result.includes('<details class="onair-unknown-html"'), 'should have details class');
		assert.ok(result.includes('retrieval_status'), 'should preserve content');
	});

	it('preserves code blocks', () => {
		const input = '```\n<tool_result>code</tool_result>\n```';
		const result = md.render(input);
		assert.ok(result.includes('<pre'), 'should have pre tag for code block');
		assert.ok(!result.includes('<details'), 'should not wrap code block content');
	});

	it('handles mixed content', () => {
		const input = `# Title

Normal text

<tool_result>tool output</tool_result>

More text`;
		const result = md.render(input);
		assert.ok(result.includes('<h1'), 'should have h1');
		assert.ok(result.includes('Normal text'), 'should have normal text');
		assert.ok(result.includes('<details class="onair-unknown-html"'), 'should have details');
		assert.ok(result.includes('More text'), 'should have more text');
	});
});
