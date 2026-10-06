import { describe, expect, it } from 'vitest';
import { cssVar, html, ident } from '../src/editor/escape.js';

describe('editor escapers', () => {
  it('html() leaves no markup and no way out of a quoted attribute', () => {
    expect(html(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
    );
  });

  it('ident() cases names as the renderer does and refuses what is left unsafe', () => {
    expect(ident('primary')).toBe('primary');
    expect(ident('Display 1')).toBe('display-1');
    expect(ident('body.lg')).toBe('body-lg');
    expect(ident('grün')).toBe('grün');
    expect(ident(');}')).toBeUndefined();
    expect(ident('')).toBeUndefined();
  });

  it('cssVar() builds a reference only from safe parts', () => {
    expect(cssVar('x-', 'ctl', 'primary', 'background', 'idle')).toBe('var(--x-ctl-primary-background-idle)');
    expect(cssVar('x-', 'ctl', '--', 'idle')).toBeUndefined();
    expect(cssVar('x;', 'ctl')).toBeUndefined();
    // whatever a name holds, the reference holds only letters, digits and hyphens
    expect(cssVar('x-', 'ctl', 'a);background:url(evil)', 'idle')).toBe('var(--x-ctl-a-background-url-evil-idle)');
  });
});
