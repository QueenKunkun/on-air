---
title: OnAir Feature Demo
date: 2026-08-18
tags: [demo, markdown, preview]
---

# OnAir — Everything in One Page

This document exercises every OnAir preview feature so you can judge them all in a
single screenshot: **math** (inline & display), **annotations**, **footnotes**,
**IEEE citations**, **syntax highlighting**, **tables**, **cross-references**,
**frontmatter**, and a **table of contents**. Everything is live — edit the file
and the preview refreshes without saving. Jump to the [math section](#math-formulas)
or the [references](#references).

## Math formulas

Inline math like $E = mc^2$ and $\int_a^b f(x)\,dx$ renders with KaTeX. **Hover
any formula to preview and copy its original LaTeX source.**

Display math with a tag:

$$
\Gamma \vdash t : T_{\mathit{effect}} \tag{1}
$$

Maxwell's equations in a display block:

$$
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}, \qquad
\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t} \tag{2}
$$

## Annotations (right margin)

A ==highlighted span==^[A short inline annotation. It becomes a card in the right
margin, anchored to the highlight.] inside a sentence.

Attach a ==rich annotation==[^rich] that spans multiple paragraphs.

A ==plain highlight== with no note stays highlighted — no card.

## Footnotes

Numbered footnotes[^1] and named footnotes[^note] land in the **bottom** footnotes
block, as do inline ones^[written directly inside the marker]. Both blocks are
collapsible and cards track their marks while you scroll.

## IEEE citations

OnAir links IEEE-style numeric citations: a single one [3], a list [2, 7], and a
range [8-10]. Each number jumps to its entry in the **References** section, and
hovering a citation previews the entry text.

## Code with syntax highlighting

```python
def fibonacci(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```typescript
const themes = THEMES.map((t) => ({
  id: t.id,
  emoji: t.label.split(" ")[0],
}));
console.table(themes);
```

```bash
# copy the live preview link
pnpm publish-all && open http://127.0.0.1:6868
```

## Tables

| Feature      | Status | Notes                       |
| ------------ | :----: | --------------------------- |
| Live preview |   ✅   | No save required            |
| Math         |   ✅   | KaTeX, self-hosted fonts    |
| Citations    |   ✅   | IEEE numeric `[3]`, `[8-10]` |

## Lists & quotes

- Bullet list with **bold**, *italic*, `inline code`, and a [link](https://example.com).
- Nesting works too:
  - Second level item.

1. Numbered list
2. Also works with math inside: $x^2 + y^2 = z^2$

> Blockquote — cross-reference a file by typing its bare name, like guide.md
> (pick from the fuzzy picker), or link it directly: [guide](guide.md) appears
> in the **Related** list in the sidebar.

---

## References

[1] L. Lamport, *LaTeX: A Document Preparation System*, 2nd ed., Addison-Wesley, 1994.

[2] D. E. Knuth, *The TeXbook*, Addison-Wesley, 1986.

[3] D. Slepian, "On bandwidth," *Proc. IEEE*, vol. 64, no. 3, pp. 292–300, 1976.

[4] J. Clerk Maxwell, "A dynamical theory of the electromagnetic field," *Phil. Trans. R. Soc.*, vol. 155, 1865.

[5] A. Einstein, "Zur Elektrodynamik bewegter Körper," *Annalen der Physik*, vol. 322, no. 10, 1905.

[6] G. H. Hardy, *A Mathematician's Apology*, Cambridge University Press, 1940.

[7] S. Kline, *Mathematical Thought from Ancient to Modern Times*, Oxford University Press, 1972.

[8] D. E. Knuth, "Literate programming," *Comput. J.*, vol. 27, no. 2, pp. 97–111, 1984.

[9] R. P. Feynman, *QED: The Strange Theory of Light and Matter*, Princeton University Press, 1985.

[10] J. von Neumann, *The Computer and the Brain*, Yale University Press, 1958.

[^1]: The first numbered footnote body.
[^note]: A named footnote — easy to reference and stays stable when numbering shifts.
[^rich]: First paragraph of the rich annotation.

    Second paragraph of the same note, demonstrating multi-paragraph content in a
    right-margin card.