'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const MarkdownRenderer = memo(({ content, className }: MarkdownRendererProps) => {
  const baseClasses = "text-base leading-relaxed text-gray-800";
  const mergedClassName = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <div className={mergedClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="text-2xl font-bold mt-4 mb-2 text-gray-900" {...props} />,
          h2: (props) => <h2 className="text-xl font-bold mt-3 mb-2 text-gray-900" {...props} />,
          h3: (props) => <h3 className="text-lg font-semibold mt-3 mb-1 text-gray-800" {...props} />,
          h4: (props) => <h4 className="text-base font-semibold mt-2 mb-1 text-gray-800" {...props} />,
          p: (props) => <p className="my-2" {...props} />,
          ul: (props) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
          li: (props) => <li className="ml-1" {...props} />,
          strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          code: (props) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props} />,
          pre: (props) => <pre className="bg-gray-100 p-3 rounded-lg my-2 overflow-x-auto whitespace-pre-wrap" {...props} />,
          blockquote: (props) => <blockquote className="border-l-4 border-gray-300 pl-4 my-2 italic text-gray-600" {...props} />,
          a: (props) => <a className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
          hr: () => <hr className="my-4 border-gray-300" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';

export default MarkdownRenderer;
