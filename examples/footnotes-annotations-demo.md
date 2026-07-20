# Footnotes & Annotations demo

This paragraph has a numbered footnote[^1] and a named footnote[^note], plus an
inline footnote^[written directly inside the marker]. All three land in the
**bottom** footnotes block.

## Annotations (right margin)

Here is a ==highlighted span==^[This is a short inline annotation. It renders as
a card in the right margin, anchored to the highlight.] inside a sentence.

You can also attach a ==rich annotation==[^rich] whose body is written as a
reference footnote so it can span multiple paragraphs.

A ==plain highlight== with no note attached just stays highlighted — no card.

## Stacking

Two highlights close together — ==first one==^[Note A, near the top.] and then
==second one==^[Note B, just below A. Their cards must not overlap; the second
is pushed down by the collision-stacking gap.] — exercise the layout.

## Long document filler

Scroll down to check that cards track their marks while the page scrolls, and
that the bottom footnotes block appears after everything with its collapse
handle.

Another ==deep annotation==^[This card lives far down the document.] near the
end.

[^1]: The first numbered footnote body.
[^note]: A named footnote — Obsidian shows it as a number but the label makes it
    easy to reference.
[^rich]: First paragraph of the rich annotation.

    Second paragraph of the same note, demonstrating multi-paragraph content in
    a right-margin card.
