/** Login failure texts by server code; see docs/API.md. */
export const loginErrorTexts: Record<string, string> = {
  session_cookie_rejected: '无法保存登录状态，请检查浏览器 Cookie 与服务连接设置。',
  rate_limited: '尝试次数过多，请一分钟后重试。',
  invalid_credentials: '账号或密码不正确，请重新输入。',
  sessions_full: '会话已满，请稍后重试。',
  internal: '暂时无法登录，请稍后重试。',
}
