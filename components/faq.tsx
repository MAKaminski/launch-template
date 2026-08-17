export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  if (items.length === 0) return null;

  return (
    <section className="my-10 divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {items.map((item) => (
        <details key={item.question} className="group py-4">
          <summary className="cursor-pointer list-none font-medium marker:content-none">
            <span className="inline-flex w-full items-center justify-between gap-4">
              {item.question}
              <span className="text-neutral-400 transition-transform group-open:rotate-45">+</span>
            </span>
          </summary>
          <p className="mt-3 leading-7 text-neutral-600 dark:text-neutral-400">{item.answer}</p>
        </details>
      ))}
    </section>
  );
}
