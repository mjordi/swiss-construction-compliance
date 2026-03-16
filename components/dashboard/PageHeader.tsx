interface PageHeaderProps {
  marker: string;
  title: string;
  subtitle: string;
}

export default function PageHeader({ marker, title, subtitle }: PageHeaderProps) {
  return (
    <>
      <div className="section-marker mb-3">{marker}</div>
      <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-1.5">
        {title}
      </h1>
      <p className="text-muted text-sm">{subtitle}</p>
    </>
  );
}
