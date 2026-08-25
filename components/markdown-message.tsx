import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  h1: ({ children }) => (
    <h1 className="mt-3 text-base font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-3 text-sm font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mt-2 whitespace-pre-wrap first:mt-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
  ),
  ol: ({ children, start }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0" start={start}>{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-75">{children}</del>,
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground first:mt-0">{children}</blockquote>
  ),
  a: ({ children, href, title }) => (
    <a className="break-words font-medium text-primary underline underline-offset-2" href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-xl bg-background/80 p-3 text-xs [&>code]:bg-transparent [&>code]:p-0">{children}</pre>
  ),
  hr: () => (
    <hr className="my-3 border-border" />
  ),
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto first:mt-0">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children, colSpan, rowSpan }) => (
    <th className="border border-border px-2 py-1 font-semibold" colSpan={colSpan} rowSpan={rowSpan}>{children}</th>
  ),
  td: ({ children, colSpan, rowSpan }) => (
    <td className="border border-border px-2 py-1 align-top" colSpan={colSpan} rowSpan={rowSpan}>{children}</td>
  ),
} satisfies Components;

export function MarkdownMessage({ children }: { children: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
