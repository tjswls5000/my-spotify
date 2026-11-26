import { useEffect, useState } from 'react';
import {
  UserRole,
  type AuthResponseDto,
  type AuthStatusDto,
} from '@my-spotify/shared-types';
import { loginUser, logoutUser, registerUser } from '../api/client.ts';
import {
  CloseIcon,
  LockIcon,
  LogoutIcon,
  PlusIcon,
  ShieldIcon,
  UserIcon,
} from './Icons.tsx';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  authStatus: AuthStatusDto;
  onAuthSuccess: (response: AuthResponseDto) => Promise<void>;
  onUserCreated: () => Promise<void>;
  onLogout: () => Promise<void>;
}

interface AuthModalContentProps {
  onClose: () => void;
  serverBaseUrl: string;
  authStatus: AuthStatusDto;
  onAuthSuccess: (response: AuthResponseDto) => Promise<void>;
  onUserCreated: () => Promise<void>;
  onLogout: () => Promise<void>;
}

function AuthModalContent({
  onClose,
  serverBaseUrl,
  authStatus,
  onAuthSuccess,
  onUserCreated,
  onLogout,
}: AuthModalContentProps) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  const currentUser = authStatus.currentUser;
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const resetFormFields = () => {
    setDisplayName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSetupAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !email.trim() || !password) {
      setErrorMessage('이름, 이메일, 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await registerUser(
        serverBaseUrl,
        {
          displayName: displayName.trim(),
          email: email.trim(),
          password,
        },
        { persistSession: true },
      );
      await onAuthSuccess(response);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '관리자 계정 생성에 실패했습니다.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await loginUser(serverBaseUrl, {
        email: email.trim(),
        password,
      });
      await onAuthSuccess(response);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateAdditionalUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !email.trim() || !password) {
      setErrorMessage('새 사용자의 이름, 이메일, 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const created = await registerUser(
        serverBaseUrl,
        {
          displayName: displayName.trim(),
          email: email.trim(),
          password,
        },
        { persistSession: false },
      );
      resetFormFields();
      setShowAddUserForm(false);
      setSuccessMessage(
        `"${created.user.displayName}" (${created.user.email}) 계정을 추가했습니다.`,
      );
      await onUserCreated();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '사용자 계정 추가에 실패했습니다.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogoutClick = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await logoutUser(serverBaseUrl);
      await onLogout();
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '로그아웃 처리에 실패했습니다.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const headerTitle = currentUser
    ? '계정 & 원격 접근 보안'
    : authStatus.authEnabled
      ? '스트리밍 서버 로그인'
      : '원격 접근 보안 설정';

  const headerSubtitle = currentUser
    ? 'JWT 인증이 활성화되어 외부 네트워크 접근이 보호되고 있습니다.'
    : authStatus.authEnabled
      ? '이 서버는 접근 보호가 활성화되어 있습니다. 계정으로 로그인하세요.'
      : '현재 로컬 개방 모드입니다. 첫 관리자 계정을 만들면 외부 접근이 잠금됩니다.';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={() => {
        if (!isBusy) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card modal-card-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-heading-with-icon">
            <div
              className={`modal-badge-icon ${
                currentUser
                  ? 'is-ok'
                  : authStatus.authEnabled
                    ? 'is-locked'
                    : ''
              }`}
            >
              {currentUser ? (
                <UserIcon className="icon-md" />
              ) : authStatus.authEnabled ? (
                <LockIcon className="icon-md" />
              ) : (
                <ShieldIcon className="icon-md" />
              )}
            </div>
            <div>
              <h2 id="auth-modal-title" className="modal-title">
                {headerTitle}
              </h2>
              <p className="modal-subtitle">{headerSubtitle}</p>
            </div>
          </div>
          <button
            id="btn-close-auth-modal"
            type="button"
            className="icon-button"
            disabled={isBusy}
            onClick={onClose}
            aria-label="닫기"
          >
            <CloseIcon className="icon-md" />
          </button>
        </div>

        <div className="modal-body">
          {errorMessage && (
            <div className="feedback-banner is-error" role="alert">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="feedback-banner is-success" role="status">
              {successMessage}
            </div>
          )}

          {/* Mode 1: Local Open Mode -> Setup First Admin */}
          {!authStatus.authEnabled && (
            <form
              className="auth-form"
              onSubmit={(event) => void handleSetupAdmin(event)}
            >
              <div className="auth-info-box">
                <strong>로컬 개방 모드 (인증 비활성화)</strong>
                <p>
                  지금은 별도 로그인 없이 모든 기기에서 서버에 접근할 수
                  있습니다. 포트 포워딩이나 터널링으로 외부에서 접속할 예정이라면
                  첫 관리자 계정을 생성해 스트리밍과 API를 보호하세요.
                </p>
              </div>

              <div className="form-field">
                <label htmlFor="auth-setup-name" className="form-label">
                  관리자 이름
                </label>
                <input
                  id="auth-setup-name"
                  type="text"
                  className="text-input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="예: 내 스트리밍 관리자"
                  autoComplete="name"
                  disabled={isBusy}
                />
              </div>

              <div className="form-field">
                <label htmlFor="auth-setup-email" className="form-label">
                  이메일
                </label>
                <input
                  id="auth-setup-email"
                  type="email"
                  className="text-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  disabled={isBusy}
                />
              </div>

              <div className="form-field">
                <label htmlFor="auth-setup-password" className="form-label">
                  비밀번호 (6자 이상)
                </label>
                <input
                  id="auth-setup-password"
                  type="password"
                  className="text-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={isBusy}
                />
              </div>

              <div className="form-field">
                <label htmlFor="auth-setup-confirm" className="form-label">
                  비밀번호 확인
                </label>
                <input
                  id="auth-setup-confirm"
                  type="password"
                  className="text-input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="비밀번호를 다시 입력"
                  autoComplete="new-password"
                  disabled={isBusy}
                />
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={isBusy}
                  onClick={onClose}
                >
                  나중에 설정
                </button>
                <button
                  id="btn-setup-admin-submit"
                  type="submit"
                  className="btn-primary-solid"
                  disabled={isBusy}
                >
                  {isBusy ? '보안 활성화 중...' : '관리자 계정 생성 및 잠금'}
                </button>
              </div>
            </form>
          )}

          {/* Mode 2: Auth Enabled & Logged Out -> Login */}
          {authStatus.authEnabled && !currentUser && (
            <form
              className="auth-form"
              onSubmit={(event) => void handleLogin(event)}
            >
              <div className="form-field">
                <label htmlFor="auth-login-email" className="form-label">
                  이메일
                </label>
                <input
                  id="auth-login-email"
                  type="email"
                  className="text-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  disabled={isBusy}
                />
              </div>

              <div className="form-field">
                <label htmlFor="auth-login-password" className="form-label">
                  비밀번호
                </label>
                <input
                  id="auth-login-password"
                  type="password"
                  className="text-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isBusy}
                />
              </div>

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={isBusy}
                  onClick={onClose}
                >
                  취소
                </button>
                <button
                  id="btn-login-submit"
                  type="submit"
                  className="btn-primary-solid"
                  disabled={isBusy}
                >
                  {isBusy ? '로그인 중...' : '로그인'}
                </button>
              </div>
            </form>
          )}

          {/* Mode 3: Logged In -> Profile + Optional Admin Add User + Logout */}
          {currentUser && (
            <div className="auth-profile-view">
              <div className="auth-profile-card">
                <div className="auth-avatar-circle" aria-hidden="true">
                  {currentUser.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="auth-profile-meta">
                  <div className="auth-profile-head">
                    <span className="auth-profile-name">
                      {currentUser.displayName}
                    </span>
                    <span
                      className={`role-badge ${
                        isAdmin ? 'is-admin' : 'is-user'
                      }`}
                    >
                      {isAdmin ? 'ADMIN' : 'USER'}
                    </span>
                  </div>
                  <span className="auth-profile-email">{currentUser.email}</span>
                  <span className="auth-profile-count">
                    등록된 계정 총 {authStatus.userCount}명
                  </span>
                </div>
              </div>

              {isAdmin && (
                <section className="modal-section">
                  <div className="modal-section-row">
                    <div className="modal-section-title">
                      <PlusIcon className="icon-xs" />
                      <span>추가 사용자 계정 관리</span>
                    </div>
                    <button
                      id="btn-toggle-add-user"
                      type="button"
                      className="btn-ghost-sm"
                      disabled={isBusy}
                      onClick={() => {
                        setShowAddUserForm((prev) => !prev);
                        setErrorMessage(null);
                      }}
                    >
                      {showAddUserForm ? '접기' : '사용자 추가'}
                    </button>
                  </div>

                  {showAddUserForm && (
                    <form
                      className="auth-form auth-subform"
                      onSubmit={(event) => void handleCreateAdditionalUser(event)}
                    >
                      <div className="form-field">
                        <label htmlFor="auth-new-user-name" className="form-label">
                          사용자 이름
                        </label>
                        <input
                          id="auth-new-user-name"
                          type="text"
                          className="text-input"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          placeholder="예: 가족 계정"
                          disabled={isBusy}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="auth-new-user-email" className="form-label">
                          이메일
                        </label>
                        <input
                          id="auth-new-user-email"
                          type="email"
                          className="text-input"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="user@example.com"
                          disabled={isBusy}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="auth-new-user-password" className="form-label">
                          비밀번호 (6자 이상)
                        </label>
                        <input
                          id="auth-new-user-password"
                          type="password"
                          className="text-input"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="••••••••"
                          disabled={isBusy}
                        />
                      </div>
                      <div className="modal-footer-actions">
                        <button
                          id="btn-create-user-submit"
                          type="submit"
                          className="btn-secondary"
                          disabled={isBusy}
                        >
                          {isBusy ? '추가 중...' : '사용자 계정 생성'}
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}

              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={isBusy}
                  onClick={onClose}
                >
                  닫기
                </button>
                <button
                  id="btn-logout-submit"
                  type="button"
                  className="btn-danger-outline"
                  disabled={isBusy}
                  onClick={() => void handleLogoutClick()}
                >
                  <LogoutIcon className="icon-xs" />
                  <span>{isBusy ? '로그아웃 중...' : '로그아웃'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthModal({
  isOpen,
  onClose,
  serverBaseUrl,
  authStatus,
  onAuthSuccess,
  onUserCreated,
  onLogout,
}: AuthModalProps) {
  if (!isOpen) {
    return null;
  }

  const contentKey = `${authStatus.authEnabled ? 'enabled' : 'open'}-${authStatus.currentUser?.id ?? 'anon'}`;

  return (
    <AuthModalContent
      key={contentKey}
      onClose={onClose}
      serverBaseUrl={serverBaseUrl}
      authStatus={authStatus}
      onAuthSuccess={onAuthSuccess}
      onUserCreated={onUserCreated}
      onLogout={onLogout}
    />
  );
}
