import type { ReactNode } from "react";
import styles from "./notice.module.css";

/** A small centered card for "something needs your attention" screens, with its actions below. */
export function Notice({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className={styles.wrap}>
      <section className={styles.card} aria-labelledby="notice-title" role="alert">
        <h1 id="notice-title">{title}</h1>
        <p>{children}</p>
        {actions && <div className={styles.actions}>{actions}</div>}
      </section>
    </main>
  );
}

export { styles as noticeStyles };
