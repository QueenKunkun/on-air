declare module '*.html' {
  const content: string;
  export default content;
}
declare module '*.css' {
  const content: string;
  export default content;
}
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}
declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}
