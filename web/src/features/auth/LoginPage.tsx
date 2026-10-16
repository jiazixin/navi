import { useEffect, useState, type SubmitEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { getSession } from '../../app/api/auth';
import { BrandMark } from '../../components/BrandMark';
import { Backdrop } from '../appearance/Backdrop';
import styles from './LoginPage.module.css';

type LoginPageProps = { connectionError?: boolean; onRetry?: () => void };

function loginError(status: number): string {
  if (status === 429) return '尝试次数过多，请一分钟后重试。';
  if (status === 401) return '账号或密码不正确，请重新输入。';
  return '暂时无法登录，请稍后重试。';
}

export function LoginPage({ connectionError = false, onRetry }: LoginPageProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = '登录 · Navi';
  }, []);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Navi-Request': '1' },
        body: JSON.stringify({ username: values.get('username'), password: values.get('password') }),
      });
      if (!response.ok) {
        setError(loginError(response.status));
        return;
      }
      // Confirm the browser kept the cookie before navigating (e.g. Secure cookies over HTTP).
      const session = await getSession();
      if (!session.authenticated) {
        setError('无法保存登录状态，请检查浏览器 Cookie 与服务连接设置。');
        return;
      }
      window.location.replace('/');
    } catch {
      setError('连接失败，请检查网络后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <Backdrop />
      <main className={styles.layout}>
        <section aria-label="Navi" className={styles.intro}>
          <p className={styles.brand}>
            <BrandMark />
            <span>NAVI</span>
          </p>
          <p className={styles.eyebrow}>YOUR SPACE, CONNECTED.</p>
          <p className={styles.statement}>
            熟悉的世界，
            <br />
            从这里出发。
          </p>
          <p className={styles.caption}>A QUIET PLACE TO BEGIN — 少一些寻找，多一些专注</p>
        </section>

        <section aria-labelledby="login-title" className={styles.card}>
          <span aria-hidden="true" className={styles.lock}>
            <LockKeyhole size={20} strokeWidth={1.8} />
          </span>
          <p className={styles.eyebrow}>WELCOME BACK</p>
          <h1 className={styles.title} id="login-title">
            登录你的空间
          </h1>
          <p className={styles.hint}>输入账号和密码，继续访问你的导航。</p>
          {connectionError ? (
            <div className={styles.notice} role="alert">
              <p>暂时无法连接服务。</p>
              <button className={styles.submit} onClick={onRetry} type="button">
                <span>重新连接</span>
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </div>
          ) : (
            <form aria-busy={pending} onSubmit={(event) => void submit(event)}>
              <label htmlFor="username">账号</label>
              <input
                autoCapitalize="none"
                autoComplete="username"
                id="username"
                maxLength={128}
                name="username"
                placeholder="请输入账号"
                required
                spellCheck={false}
              />
              <label htmlFor="password">密码</label>
              <div className={styles.password}>
                <input
                  aria-describedby={error ? 'login-error' : undefined}
                  autoComplete="current-password"
                  id="password"
                  maxLength={1024}
                  name="password"
                  placeholder="请输入密码"
                  required
                  type={visible ? 'text' : 'password'}
                />
                <button
                  aria-label={visible ? '隐藏密码' : '显示密码'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                  type="button"
                >
                  {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </div>
              <div aria-live="polite" className={styles.feedback}>
                {error ? (
                  <p id="login-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <button className={styles.submit} disabled={pending} type="submit">
                <span>{pending ? '正在登录…' : '登录并进入'}</span>
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </form>
          )}
          <p className={styles.note}>
            <LockKeyhole aria-hidden="true" size={12} /> 私人空间 · 仅限授权访问
          </p>
        </section>
      </main>
    </div>
  );
}
