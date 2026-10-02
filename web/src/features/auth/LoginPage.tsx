import { useEffect, useState, type SubmitEvent } from 'react';
import { ArrowRight, Compass, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { getSession } from '../../app/api/auth';
import styles from './LoginPage.module.css';

type Props = { checking?: boolean; connectionError?: boolean; onRetry?: () => void };

export function LoginPage({ checking = false, connectionError = false, onRetry }: Props): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { document.title = '登录 · Navi'; }, []);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Navi-Request': '1' },
        body: JSON.stringify({ username: values.get('username'), password: values.get('password') }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? '尝试次数过多，请一分钟后重试。'
          : response.status === 401 ? '账号或密码不正确，请重新输入。' : '暂时无法登录，请稍后重试。');
        return;
      }
      // Confirm the browser accepted the cookie before navigating (e.g. Secure on HTTP).
      const session = await getSession();
      if (!session.authenticated) { setError('无法保存登录状态，请检查浏览器 Cookie 与服务连接设置。'); return; }
      window.location.replace('/');
    } catch { setError('连接失败，请检查网络后重试。'); }
    finally { setPending(false); }
  }

  return <main className={styles.page}>
    <section className={styles.intro} aria-label="Navi">
      <a className={styles.brand} href="/login"><Compass aria-hidden="true" size={28} /> Navi<span>你的私人导航</span></a>
      <div className={styles.orbit} aria-hidden="true"><i /><i /><i /><span>n.</span><b /></div>
      <div className={styles.statement}><p>YOUR SPACE, CONNECTED.</p><h1>熟悉的世界，<br />从这里出发。</h1><p className={styles.description}>让常用的每一站，都触手可及。</p></div>
      <span className={styles.caption}>A QUIET PLACE TO BEGIN / NAVI</span>
    </section>
    <section className={styles.panel} aria-labelledby="login-title">
      <div className={styles.formWrap}>
        <span className={styles.lock}><LockKeyhole aria-hidden="true" size={22} /></span>
        <p className={styles.eyebrow}>WELCOME BACK</p>
        <h2 id="login-title">登录你的空间</h2>
        <p className={styles.hint}>输入账号和密码，继续访问你的导航。</p>
        {checking ? <p role="status" className={styles.notice}>正在确认登录状态…</p>
          : connectionError ? <div className={styles.notice} role="alert"><p>暂时无法连接服务。</p><button className={styles.submit} onClick={onRetry}>重新连接</button></div>
          : <form onSubmit={(event) => { void submit(event); }} aria-busy={pending}>
            <label htmlFor="username">账号</label>
            <input id="username" name="username" autoComplete="username" required maxLength={128} placeholder="请输入账号" spellCheck={false} autoCapitalize="none" />
            <label htmlFor="password">密码</label>
            <div className={styles.password}>
              <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} placeholder="请输入密码" aria-describedby={error ? 'login-error' : undefined} />
              <button type="button" aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            </div>
            <div className={styles.feedback} aria-live="polite">{error && <p id="login-error" role="alert">{error}</p>}</div>
            <button className={styles.submit} type="submit" disabled={pending}><span>{pending ? '正在登录…' : '登录并进入'}</span><ArrowRight aria-hidden="true" size={20} /></button>
          </form>}
        <p className={styles.privateNote}><LockKeyhole aria-hidden="true" size={13} /> 私人空间 · 仅限授权访问</p>
      </div>
      <footer className={styles.footer}>少一些寻找，多一些专注。</footer>
    </section>
  </main>;
}
