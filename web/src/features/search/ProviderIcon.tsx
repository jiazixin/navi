import { useId, type CSSProperties } from 'react';
import {
  siBaidu,
  siClaude,
  siGithub,
  siGooglegemini,
  type SimpleIcon,
} from 'simple-icons';
import type { SearchProviderID } from './providers';

type ProviderIconProps = {
  className?: string | undefined;
  providerID: SearchProviderID;
};

type BrandIcon = Pick<SimpleIcon, 'hex' | 'path'>;
type MonochromeProviderID = Exclude<SearchProviderID, 'gemini' | 'google'>;

const openAIPath =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

const baiduPawPath =
  'M9.154 0C7.71 0 6.54 1.658 6.54 3.707c0 2.051 1.171 3.71 2.615 3.71 1.446 0 2.614-1.659 2.614-3.71C11.768 1.658 10.6 0 9.154 0zm7.025.594C14.86.58 13.347 2.589 13.2 3.927c-.187 1.745.25 3.487 2.179 3.735 1.933.25 3.175-1.806 3.422-3.364.252-1.555-.995-3.364-2.362-3.674a1.218 1.218 0 0 0-.261-.03zM3.582 5.535a2.811 2.811 0 0 0-.156.008c-2.118.19-2.428 3.24-2.428 3.24-.287 1.41.686 4.425 3.297 3.864 2.617-.561 2.262-3.68 2.183-4.362-.125-1.018-1.292-2.773-2.896-2.75zm16.534 1.753c-2.308 0-2.617 2.119-2.617 3.616 0 1.43.121 3.425 2.988 3.362 2.867-.063 2.553-3.238 2.553-3.988 0-.745-.62-2.99-2.924-2.99zm-8.264 2.478c-1.424.014-2.708.925-3.323 1.947-1.118 1.868-2.863 3.05-3.112 3.363-.25.309-3.61 2.116-2.864 5.42.746 3.301 3.365 3.237 3.365 3.237s1.93.19 4.171-.31c2.24-.495 4.17.123 4.17.123s5.233 1.748 6.665-1.616c1.43-3.364-.808-5.109-.808-5.109s-2.99-2.306-4.736-4.798c-1.072-1.665-2.348-2.268-3.528-2.257z';

const providerIcons: Record<MonochromeProviderID, BrandIcon> = {
  baidu: { ...siBaidu, path: baiduPawPath },
  yandex: {
    hex: 'FC3F1D',
    path: 'M14.44 2.5c-4.9 0-8.02 2.47-8.02 6.45 0 2.84 1.42 4.82 4.03 6.05l-4.18 6.5h3.47l3.73-5.98h1.34v5.98h3.02v-19h-3.39Zm.37 10.38h-1.18c-2.7 0-4.12-1.3-4.12-3.77 0-2.56 1.57-3.98 4.34-3.98h.96v7.75Z',
  },
  bing: {
    hex: '258FFA',
    path: 'M6.18 2.1v15.24l5.42 3.19 6.9-4.08v-4.2l-6.52 3.27-2.31-1.38V7.7l5.08 2.55 3.75-1.91L6.18 2.1Z',
  },
  github: siGithub,
  chatgpt: { hex: '101010', path: openAIPath },
  claude: siClaude,
};

function GoogleIcon({ className }: Pick<ProviderIconProps, 'className'>): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-provider-icon="google"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GeminiIcon({ className }: Pick<ProviderIconProps, 'className'>): React.JSX.Element {
  const instanceID = `provider-gemini-${useId().replace(/:/g, '')}`;
  const clipPathID = `${instanceID}-clip`;
  const redGradientID = `${instanceID}-red`;
  const yellowGradientID = `${instanceID}-yellow`;
  const greenGradientID = `${instanceID}-green`;

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-provider-icon="gemini"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <defs>
        <clipPath id={clipPathID}>
          <path d={siGooglegemini.path} />
        </clipPath>
        <radialGradient
          cx="10"
          cy="2"
          gradientUnits="userSpaceOnUse"
          id={redGradientID}
          r="15.5"
        >
          <stop offset="0" stopColor="#FC413D" />
          <stop offset="0.48" stopColor="#FC413D" stopOpacity="0.94" />
          <stop offset="1" stopColor="#FC413D" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          cx="0"
          cy="11"
          gradientUnits="userSpaceOnUse"
          id={yellowGradientID}
          r="11.5"
        >
          <stop offset="0" stopColor="#FBBC04" />
          <stop offset="0.45" stopColor="#FBBC04" stopOpacity="0.96" />
          <stop offset="1" stopColor="#FBBC04" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          cx="8"
          cy="24"
          gradientUnits="userSpaceOnUse"
          id={greenGradientID}
          r="17"
        >
          <stop offset="0" stopColor="#00B95C" />
          <stop offset="0.45" stopColor="#00B95C" stopOpacity="0.95" />
          <stop offset="1" stopColor="#00B95C" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clipPathID})`}>
        <rect fill="#3186FF" height="24" width="24" />
        <circle cx="10" cy="2" fill={`url(#${redGradientID})`} r="15.5" />
        <circle cx="0" cy="11" fill={`url(#${yellowGradientID})`} r="11.5" />
        <circle cx="8" cy="24" fill={`url(#${greenGradientID})`} r="17" />
      </g>
    </svg>
  );
}

export function ProviderIcon({ className, providerID }: ProviderIconProps): React.JSX.Element {
  if (providerID === 'google') return <GoogleIcon className={className} />;
  if (providerID === 'gemini') return <GeminiIcon className={className} />;

  const icon = providerIcons[providerID];
  const style = { '--provider-brand': `#${icon.hex}` } as CSSProperties;

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-provider-icon={providerID}
      focusable="false"
      style={style}
      viewBox="0 0 24 24"
    >
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}
