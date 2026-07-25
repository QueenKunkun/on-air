/** Centralized localStorage keys for the on-air preview. */
export const LS_KEYS = {
	/** Banner settings */
	THEME: 'onair-theme',
	FONT_SIZE: 'onair-font-size',
	SCROLLBAR_WIDTH: 'onair-scrollbar-width',
	MAX_WIDTH: 'onair-max-width',

	/** Panel collapse state */
	FILES_COLLAPSED: 'onair-files-collapsed',
	TOC_COLLAPSED: 'onair-toc-collapsed',

	/** Panel widths (used by useResizer and Layout) */
	FILES_WIDTH: 'onair-files-width',
	TOC_WIDTH: 'onair-toc-width',

	/** Footnotes */
	FOOTNOTES_COLLAPSED: 'onair-footnotes-collapsed',

	/** Annotations */
	ANNOT_HOVER: 'onair-annot-hover',
	ANNOT_WIDTH: 'onair-annot-width',
	ANNOT_COLLAPSED: 'onair-annot-collapsed',

	/** File tree */
	FT_FILTERS: 'onair-ft-filters',
	FT_EXPANDED: 'onair-ft-expanded',

	/** Related links */
	RELATED_HEIGHT: 'onair-related-height',
} as const;
