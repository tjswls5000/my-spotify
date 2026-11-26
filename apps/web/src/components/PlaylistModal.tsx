import { useEffect, useRef, useState } from 'react';
import type { PlaylistDto } from '@my-spotify/shared-types';
import { CloseIcon, ListMusicIcon } from './Icons.tsx';

export interface PlaylistModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialPlaylist?: PlaylistDto | null;
  pendingTrackTitle?: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
}

interface PlaylistModalFormProps {
  mode: 'create' | 'edit';
  initialName: string;
  initialDescription: string;
  pendingTrackTitle?: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; description: string }) => Promise<void>;
}

function PlaylistModalForm({
  mode,
  initialName,
  initialDescription,
  pendingTrackTitle,
  onClose,
  onSubmit,
}: PlaylistModalFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('플레이리스트 이름을 입력해 주세요.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim(),
      });
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '플레이리스트를 저장하지 못했습니다.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlist-modal-title"
      onClick={() => {
        if (!isSaving) {
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
            <div className="modal-badge-icon">
              <ListMusicIcon className="icon-md" />
            </div>
            <div>
              <h2 id="playlist-modal-title" className="modal-title">
                {mode === 'create' ? '새 플레이리스트 만들기' : '플레이리스트 수정'}
              </h2>
              <p className="modal-subtitle">
                {pendingTrackTitle
                  ? `생성 후 "${pendingTrackTitle}" 트랙이 바로 추가됩니다.`
                  : mode === 'create'
                    ? '원하는 트랙을 모아 나만의 재생목록을 구성하세요.'
                    : '플레이리스트 이름과 설명을 변경합니다.'}
              </p>
            </div>
          </div>
          <button
            id="btn-close-playlist-modal"
            type="button"
            className="icon-button"
            disabled={isSaving}
            onClick={onClose}
            aria-label="닫기"
          >
            <CloseIcon className="icon-md" />
          </button>
        </div>

        <form className="modal-body" onSubmit={(event) => void handleSubmit(event)}>
          {errorMessage && (
            <div className="feedback-banner is-error" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="input-playlist-name" className="form-label">
              이름
            </label>
            <input
              ref={nameInputRef}
              id="input-playlist-name"
              type="text"
              className="text-input"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 새벽 코딩 재즈, 드라이브 플레이리스트"
              disabled={isSaving}
            />
          </div>

          <div className="form-field">
            <label htmlFor="input-playlist-description" className="form-label">
              설명 (선택)
            </label>
            <textarea
              id="input-playlist-description"
              className="text-input text-area"
              rows={3}
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="이 플레이리스트에 대한 간단한 메모를 남겨보세요."
              disabled={isSaving}
            />
          </div>

          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn-ghost"
              disabled={isSaving}
              onClick={onClose}
            >
              취소
            </button>
            <button
              id="btn-submit-playlist"
              type="submit"
              className="btn-primary-solid"
              disabled={isSaving || !name.trim()}
            >
              {isSaving
                ? '저장 중...'
                : mode === 'create'
                  ? '플레이리스트 생성'
                  : '변경사항 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PlaylistModal({
  isOpen,
  mode,
  initialPlaylist,
  pendingTrackTitle,
  onClose,
  onSubmit,
}: PlaylistModalProps) {
  if (!isOpen) {
    return null;
  }

  const formKey = `${mode}-${initialPlaylist?.id ?? 'new'}-${pendingTrackTitle ?? ''}`;

  return (
    <PlaylistModalForm
      key={formKey}
      mode={mode}
      initialName={mode === 'edit' ? (initialPlaylist?.name ?? '') : ''}
      initialDescription={
        mode === 'edit' ? (initialPlaylist?.description ?? '') : ''
      }
      pendingTrackTitle={pendingTrackTitle}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
