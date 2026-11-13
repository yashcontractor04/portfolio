import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders Markdown from a README. Safe by construction: react-markdown builds
 * React elements and ignores raw HTML in the source, so a README cannot inject
 * scripts. Images are dropped (cross-origin images are blocked by our isolation
 * headers anyway) and links open in a new tab without passing the referrer.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown max-w-3xl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
