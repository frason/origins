import type { ReactNode } from 'react';

interface SimWindowProps {
  title: string;
  children: ReactNode;
  controls?: ReactNode;
  menu?: ReactNode;
  status?: ReactNode;
  className?: string;
}

export default function SimWindow({
  title,
  children,
  controls,
  menu,
  status,
  className = '',
}: SimWindowProps) {
  const classes = ['sim-window', className].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      <header className="sim-window__title-bar">
        <h2 className="sim-window__title">{title}</h2>
        {controls && <div className="sim-window__controls">{controls}</div>}
      </header>
      {menu && <nav className="sim-window__menu-bar" aria-label={`${title} menu`}>{menu}</nav>}
      <div className="sim-window__body">{children}</div>
      {status && <footer className="sim-window__status-bar">{status}</footer>}
    </section>
  );
}
