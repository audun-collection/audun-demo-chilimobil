const YEAR = new Date().getFullYear();

export function Footer(): JSX.Element {
  return (
    <footer className="mx-auto mt-16 flex max-w-6xl flex-col items-center gap-1 px-6 pb-10 text-[11px] text-ink-500">
      <p>© {YEAR} Audun</p>
    </footer>
  );
}
