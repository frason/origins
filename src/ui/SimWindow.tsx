import type { ReactNode } from 'react';

interface SimWindowProps {
  title: string;
  children: ReactNode;
  controls?: ReactNode;
  menu?: ReactNode;
  status?: ReactNode;
  className?: string;
  bodyClassName?: string;
  titleAs?: 'h1' | 'h2';
}

export default function SimWindow({
  title,
  children,
  controls,
  menu,
  status,
  className = '',
  bodyClassName = '',
  titleAs = 'h2',
}: SimWindowProps) {
  const classes = ['sim-window', className].filter(Boolean).join(' ');
  const bodyClasses = ['sim-window__body', bodyClassName].filter(Boolean).join(' ');
  const Title = titleAs;

  return (
    <section className={classes}>
      <header className="sim-window__title-bar">
        <Title className="sim-window__title">{title}</Title>
        {controls && <div className="sim-window__controls">{controls}</div>}
      </header>
      {menu && <nav className="sim-window__menu-bar" aria-label={`${title} menu`}>{menu}</nav>}
      <div className={bodyClasses}>{children}</div>
      {status && <footer className="sim-window__status-bar">{status}</footer>}
    </section>
  );
}
