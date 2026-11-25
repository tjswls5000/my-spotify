import { useEffect, useState } from 'react';
import type {
  DirectoryBrowseResponseDto,
  LibraryFolderDto,
  ScanResultDto,
} from '@my-spotify/shared-types';
import {
  addLibraryFolder,
  browseServerDirectories,
  removeLibraryFolder,
  triggerLibraryScan,
} from '../api/client.ts';
import {
  ChevronUpIcon,
  CloseIcon,
  FolderIcon,
  FolderPlusIcon,
  RefreshIcon,
  ServerIcon,
  TrashIcon,
} from './Icons.tsx';

interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  onChangeServerBaseUrl: (nextUrl: string) => void;
  libraries: LibraryFolderDto[];
  onLibraryChanged: (scanResult?: ScanResultDto) => Promise<void>;
}

export function LibraryManagerModal({
  isOpen,
  onClose,
  serverBaseUrl,
  onChangeServerBaseUrl,
  libraries,
  onLibraryChanged,
}: LibraryManagerModalProps) {
  const [serverInput, setServerInput] = useState(serverBaseUrl);
  const [manualPath, setManualPath] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [browseData, setBrowseData] =
    useState<DirectoryBrowseResponseDto | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();
    browseServerDirectories(serverBaseUrl, undefined, controller.signal)
      .then((data) => {
        setBrowseData(data);
        setManualPath(data.currentPath);
        setFeedbackError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setBrowseData(null);
        setFeedbackError(
          error instanceof Error
            ? error.message
            : '스트리밍 서버 폴더 목록을 불러오지 못했습니다.',
        );
      });

    return () => controller.abort();
  }, [isOpen, serverBaseUrl]);

  if (!isOpen) {
    return null;
  }

  const handleNavigateDirectory = async (targetPath: string) => {
    setBrowseLoading(true);
    setFeedbackError(null);
    try {
      const data = await browseServerDirectories(serverBaseUrl, targetPath);
      setBrowseData(data);
      setManualPath(data.currentPath);
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : '폴더를 열 수 없습니다.',
      );
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleAddFolder = async (pathToAdd: string) => {
    if (!pathToAdd.trim()) {
      setFeedbackError('등록할 폴더 경로를 입력하거나 선택해 주세요.');
      return;
    }

    setActionBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const { folder, scan } = await addLibraryFolder(serverBaseUrl, {
        path: pathToAdd.trim(),
        name: folderLabel.trim() || undefined,
      });
      setFolderLabel('');
      setFeedbackSuccess(
        `"${folder.name}" 등록 및 스캔 완료 · ${scan.filesFound}곡 발견 (+${scan.addedCount} 추가, ${scan.durationMs}ms)`,
      );
      await onLibraryChanged(scan);
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : '폴더 등록에 실패했습니다.',
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveFolder = async (folder: LibraryFolderDto) => {
    setActionBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      await removeLibraryFolder(serverBaseUrl, folder.id);
      setFeedbackSuccess(`"${folder.name}" 폴더 연결을 해제했습니다.`);
      await onLibraryChanged();
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : '폴더 삭제에 실패했습니다.',
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleRescan = async (folderId?: string) => {
    setActionBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const scan = await triggerLibraryScan(serverBaseUrl, folderId);
      setFeedbackSuccess(
        `스캔 완료 · ${scan.filesFound}곡 확인 (+${scan.addedCount} 추가 / ${scan.updatedCount} 업데이트 / -${scan.removedCount} 삭제 · ${scan.durationMs}ms)`,
      );
      await onLibraryChanged(scan);
    } catch (error) {
      setFeedbackError(
        error instanceof Error ? error.message : '스캔에 실패했습니다.',
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveServerUrl = (event: React.FormEvent) => {
    event.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);
    onChangeServerBaseUrl(serverInput);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="library-modal-title" className="modal-title">
              스트리밍 서버 &amp; 음원 폴더 관리
            </h2>
            <p className="modal-subtitle">
              연결된 스트리밍 서버에 실제로 존재하는 음원 파일만 자동 스캔되어
              재생됩니다.
            </p>
          </div>
          <button
            id="btn-close-library-modal"
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="닫기"
          >
            <CloseIcon className="icon-md" />
          </button>
        </div>

        <div className="modal-body">
          {/* 1. Streaming Server Connection */}
          <section className="modal-section">
            <div className="modal-section-title">
              <ServerIcon className="icon-sm" />
              <span>스트리밍 서버 주소</span>
            </div>
            <form className="inline-form" onSubmit={handleSaveServerUrl}>
              <input
                id="input-server-url"
                type="text"
                className="text-input mono"
                value={serverInput}
                onChange={(event) => setServerInput(event.target.value)}
                placeholder="비워두면 로컬 프록시(/api) 사용 · 예: http://192.168.0.10:3001"
              />
              <button
                id="btn-connect-server"
                type="submit"
                className="btn-secondary"
              >
                연결 적용
              </button>
              {serverBaseUrl && (
                <button
                  id="btn-reset-server"
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setServerInput('');
                    onChangeServerBaseUrl('');
                  }}
                >
                  로컬 기본값
                </button>
              )}
            </form>
          </section>

          {feedbackError && (
            <div className="feedback-banner is-error" role="alert">
              {feedbackError}
            </div>
          )}
          {feedbackSuccess && (
            <div className="feedback-banner is-success" role="status">
              {feedbackSuccess}
            </div>
          )}

          {/* 2. Registered Library Folders */}
          <section className="modal-section">
            <div className="modal-section-row">
              <div className="modal-section-title">
                <FolderIcon className="icon-sm" />
                <span>등록된 라이브러리 폴더 ({libraries.length})</span>
              </div>
              {libraries.length > 0 && (
                <button
                  id="btn-rescan-all-modal"
                  type="button"
                  className="btn-ghost-sm"
                  disabled={actionBusy}
                  onClick={() => void handleRescan()}
                >
                  <RefreshIcon
                    className={`icon-xs ${actionBusy ? 'is-spinning' : ''}`}
                  />
                  <span>전체 다시 스캔</span>
                </button>
              )}
            </div>

            {libraries.length === 0 ? (
              <p className="muted-note">
                아직 등록된 음원 폴더가 없습니다. 아래에서 서버의 음원 폴더를
                선택해 추가해 주세요.
              </p>
            ) : (
              <ul className="registered-folder-list">
                {libraries.map((folder) => (
                  <li key={folder.id} className="registered-folder-item">
                    <div className="registered-folder-info">
                      <div className="registered-folder-head">
                        <span className="registered-folder-name">
                          {folder.name}
                        </span>
                        <span className="count-chip">{folder.trackCount}곡</span>
                        {folder.isWatching && (
                          <span className="watch-badge">자동 감지</span>
                        )}
                      </div>
                      <code className="registered-folder-path">
                        {folder.path}
                      </code>
                    </div>
                    <div className="registered-folder-actions">
                      <button
                        type="button"
                        className="icon-button"
                        disabled={actionBusy}
                        onClick={() => void handleRescan(folder.id)}
                        title="이 폴더 다시 스캔"
                        aria-label={`${folder.name} 다시 스캔`}
                      >
                        <RefreshIcon className="icon-sm" />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        disabled={actionBusy}
                        onClick={() => void handleRemoveFolder(folder)}
                        title="폴더 연결 해제"
                        aria-label={`${folder.name} 연결 해제`}
                      >
                        <TrashIcon className="icon-sm" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Server Directory Browser & Add Folder */}
          <section className="modal-section">
            <div className="modal-section-title">
              <FolderPlusIcon className="icon-sm" />
              <span>서버 폴더 탐색 및 추가</span>
            </div>

            <div className="inline-form">
              <input
                id="input-folder-path"
                type="text"
                className="text-input mono"
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="서버의 절대 폴더 경로 입력 (예: /Users/me/Music)"
              />
              <button
                id="btn-open-path"
                type="button"
                className="btn-ghost"
                disabled={browseLoading || !manualPath.trim()}
                onClick={() => void handleNavigateDirectory(manualPath)}
              >
                이동
              </button>
            </div>

            <div className="inline-form compact-top">
              <input
                id="input-folder-name"
                type="text"
                className="text-input"
                value={folderLabel}
                onChange={(event) => setFolderLabel(event.target.value)}
                placeholder="표시 이름 (선택 · 비우면 폴더명 사용)"
              />
              <button
                id="btn-add-selected-folder"
                type="button"
                className="btn-primary-solid"
                disabled={actionBusy || !manualPath.trim()}
                onClick={() => void handleAddFolder(manualPath)}
              >
                {actionBusy ? '스캔 중...' : '이 폴더 추가 및 스캔'}
              </button>
            </div>

            {browseData && (
              <div className="directory-browser">
                <div className="directory-browser-bar">
                  <button
                    id="btn-parent-directory"
                    type="button"
                    className="btn-ghost-sm"
                    disabled={!browseData.parentPath || browseLoading}
                    onClick={() => {
                      if (browseData.parentPath) {
                        void handleNavigateDirectory(browseData.parentPath);
                      }
                    }}
                  >
                    <ChevronUpIcon className="icon-xs" />
                    <span>상위 폴더</span>
                  </button>
                  <code className="browser-current-path">
                    {browseData.currentPath}
                  </code>
                  <span className="browser-audio-count mono">
                    오디오 {browseData.audioFileCount}개
                  </span>
                </div>

                <div className="directory-list">
                  {browseData.directories.length === 0 ? (
                    <div className="directory-empty">
                      하위 폴더가 없습니다. 상단 버튼으로 현재 폴더를 바로
                      등록할 수 있습니다.
                    </div>
                  ) : (
                    browseData.directories.map((dir) => (
                      <button
                        key={dir.path}
                        type="button"
                        className="directory-row"
                        disabled={browseLoading}
                        onClick={() => void handleNavigateDirectory(dir.path)}
                      >
                        <FolderIcon className="icon-sm" />
                        <span>{dir.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
