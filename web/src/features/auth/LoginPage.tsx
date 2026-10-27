import { useEffect, useState, type SubmitEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useLogin } from './useAuthData'
import { ApiError } from '../../app/api'
import { errorText, fieldErrorText } from '../../app/errors'
import { BrandMark } from '../../components/BrandMark'
import { Backdrop } from '../appearance'
import { loginErrorTexts } from './loginErrors'
import styles from './LoginPage.module.css'

type LoginPageProps = { isConnectionError?: boolean; onRetry?: () => void }

export function LoginPage({
  isConnectionError = false,
  onRetry,
}: LoginPageProps): React.JSX.Element {
  const [isPasswordVisible, setPasswordVisible] = useState(false)
  const mutation = useLogin()
  const isPending = mutation.isPending
  const usernameError = fieldErrorText(mutation.error, 'username')
  const passwordError = fieldErrorText(mutation.error, 'password')
  const error = mutation.isError ? errorText(mutation.error, loginErrorTexts) : ''
  let passwordDescription: string | undefined
  if (passwordError) passwordDescription = 'password-error'
  else if (error) passwordDescription = 'login-error'

  useEffect(() => {
    const previousTitle = document.title
    document.title = '登录 · Navi'
    return () => {
      document.title = previousTitle
    }
  }, [])

  function handleSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (isPending) return
    const values = new FormData(event.currentTarget)
    mutation.mutate({ username: values.get('username'), password: values.get('password') })
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
          {isConnectionError ? (
            <div className={styles.notice} role="alert">
              <p>
                {errorText(
                  new ApiError('session unavailable', {
                    status: 0,
                    code: 'network_unavailable',
                    requestId: '',
                  }),
                )}
              </p>
              <button className={styles.submit} onClick={onRetry} type="button">
                <span>重新连接</span>
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </div>
          ) : (
            <form aria-label="登录" aria-busy={isPending} onSubmit={handleSubmit}>
              <label htmlFor="username">账号</label>
              <input
                aria-invalid={usernameError !== ''}
                aria-describedby={usernameError ? 'username-error' : undefined}
                autoCapitalize="none"
                autoComplete="username"
                id="username"
                maxLength={128}
                name="username"
                placeholder="请输入账号"
                required
                spellCheck={false}
              />
              {usernameError ? (
                <p id="username-error" role="alert">
                  {usernameError}
                </p>
              ) : null}
              <label htmlFor="password">密码</label>
              <div className={styles.password}>
                <input
                  aria-invalid={passwordError !== ''}
                  aria-describedby={passwordDescription}
                  autoComplete="current-password"
                  id="password"
                  maxLength={72}
                  name="password"
                  placeholder="请输入密码"
                  required
                  type={isPasswordVisible ? 'text' : 'password'}
                />
                <button
                  aria-label={isPasswordVisible ? '隐藏密码' : '显示密码'}
                  aria-pressed={isPasswordVisible}
                  onClick={() => setPasswordVisible(!isPasswordVisible)}
                  type="button"
                >
                  {isPasswordVisible ? (
                    <EyeOff aria-hidden="true" size={18} />
                  ) : (
                    <Eye aria-hidden="true" size={18} />
                  )}
                </button>
              </div>
              {passwordError ? (
                <p id="password-error" role="alert">
                  {passwordError}
                </p>
              ) : null}
              <div aria-live="polite" className={styles.feedback}>
                {error ? (
                  <p id="login-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <button className={styles.submit} disabled={isPending} type="submit">
                <span>{isPending ? '正在登录…' : '登录并进入'}</span>
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
  )
}
