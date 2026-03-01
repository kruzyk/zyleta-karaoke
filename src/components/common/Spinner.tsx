import styles from './Spinner.module.css';

export function Spinner() {
  return (
    <div className={styles.spinner} role="status" aria-busy="true">
      <div className={styles.ring} />
      <span className={styles.srOnly}>Loading...</span>
    </div>
  );
}
