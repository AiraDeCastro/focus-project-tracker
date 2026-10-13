import styles from "./skeleton.module.css";

/** Shown while the dashboard loads real data: the same card grid, with quiet placeholders. */
export function DashboardSkeleton() {
  return (
    <div className={styles.wrap} role="status" aria-busy="true">
      <span className={styles.srOnly}>Loading your repos...</span>
      <div className={`${styles.card} ${styles.title}`} aria-hidden="true">
        <i className={styles.line} style={{ width: "40%" }} />
        <i className={styles.line} style={{ width: "65%" }} />
      </div>
      <div className={styles.grid} aria-hidden="true">
        <div className={`${styles.card} ${styles.ring}`}>
          <i className={styles.circle} />
          <i className={styles.line} style={{ width: "60%" }} />
        </div>
        <div className={`${styles.card} ${styles.graph}`}>
          <i className={styles.line} style={{ width: "35%" }} />
          <i className={styles.block} />
        </div>
        <div className={`${styles.card} ${styles.today}`}>
          <i className={styles.line} style={{ width: "50%" }} />
          <i className={styles.pill} />
          <i className={styles.pill} />
          <i className={styles.pill} />
        </div>
      </div>
    </div>
  );
}
