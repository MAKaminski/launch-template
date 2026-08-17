/**
 * Ambient declaration for MDX imports.
 *
 * `app/page.tsx` and `app/[slug]/page.tsx` import `.mdx` files directly.
 * @next/mdx compiles them at build time, but TypeScript needs to be told the
 * module shape or the import is an unresolved-module error.
 */
declare module "*.mdx" {
  import type { MDXProps } from "mdx/types";

  const MDXComponent: (props: MDXProps) => React.JSX.Element;
  export default MDXComponent;
}
