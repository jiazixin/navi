import { useEffect, useState } from 'react';
import { describeDate, greeting, pad2 } from './time';
import styles from './HeroClock.module.css';

export function HeroClock(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;
    const schedule = (): void => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 1000 - (Date.now() % 1000));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const hours = pad2(now.getHours());
  const minutes = pad2(now.getMinutes());
  const seconds = now.getSeconds();
  const date = describeDate(now);

  return (
    <div className={styles.clock}>
      <p className={styles.dateline}>
        <span>{date.latin}</span>
        <span aria-hidden="true" className={styles.bar} />
        <span>{date.chinese}</span>
      </p>
      <p className={styles.time}>
        <time dateTime={`${hours}:${minutes}`}>
          <span className={styles.visuallyHidden}>当前时间 {hours}:{minutes}</span>
          <span aria-hidden="true">{hours}</span>
          <span aria-hidden="true" className={styles.colon} />
          <span aria-hidden="true">{minutes}</span>
        </time>
        <span aria-hidden="true" className={styles.seconds}>
          {pad2(seconds)}
          <i style={{ '--progress': seconds / 59 } as React.CSSProperties} />
        </span>
      </p>
      <p className={styles.greeting}>{greeting(now.getHours())}</p>
    </div>
  );
}
