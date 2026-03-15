import React, { useEffect, useState } from 'react';
import { completeUpload, initUpload } from '../lib/api';
import { compressImageFile } from '../lib/image';
import type { PhotoRecord } from '../types';

type PhotoUploaderProps = {
  jobId: number;
  token: string;
  onUploaded: () => Promise<void>;
};

function formatBytes(value: number) {
  // Convert byte count to human-readable format (B, KB, MB).
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PhotoUploader({ jobId, token, onUploaded }: PhotoUploaderProps) {
  // Selected file and preview state.
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Upload progress/status messages and error handling.
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Loading/completion state; track last uploaded photo for confirmation.
  const [busy, setBusy] = useState(false);
  const [lastUpload, setLastUpload] = useState<PhotoRecord | null>(null);

  // Create blob URL for image preview; cleanup on unmount or file change.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Upload handler: compress image, request pre-signed URL, upload to S3, finalize.
  async function handleUpload() {
    if (!file) {
      setError('Select a photo before uploading');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus('Compressing image...');

    try {
      const compressed = await compressImageFile(file);
      setStatus(`Compressed to ${compressed.width}x${compressed.height} at ${formatBytes(compressed.compressedSize)}`);

      const initialized = await initUpload(token, {
        filename: compressed.fileName,
        mime: compressed.mime,
        size: compressed.compressedSize,
        jobId,
      });

      setStatus('Uploading to object storage...');
      const uploadResponse = await fetch(initialized.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': compressed.mime },
        body: compressed.blob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload request failed with status ${uploadResponse.status}`);
      }

      setStatus('Recording metadata...');
      const completed = await completeUpload(token, {
        key: initialized.key,
        mime: compressed.mime,
        size: compressed.compressedSize,
        jobId,
      });

      setLastUpload(completed.photo);
      setStatus('Upload complete');
      setFile(null);
      await onUploaded();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="detail-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Media</p>
          <h3>Photo upload</h3>
        </div>
      </div>

      <div className="uploader-shell">
        <label className="file-picker">
          <span>Select image</span>
          <div className="file-picker__row" aria-hidden="true">
            <span className="file-picker__button">Browse photo</span>
            <span className="file-picker__filename">{file ? file.name : 'No file selected'}</span>
          </div>
          <input
            accept="image/*"
            className="file-picker__input"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            type="file"
          />
        </label>

        {previewUrl ? <img alt="Selected upload preview" className="upload-preview" src={previewUrl} /> : null}

        {file ? (
          <p className="panel-copy">
            {file.name} · {formatBytes(file.size)}
          </p>
        ) : (
          <p className="panel-copy">Client-side compression targets a 1280px long edge and JPEG quality around 70%.</p>
        )}

        {status ? <p className="status-note">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <button className="btn btn-primary" disabled={busy || !file} onClick={handleUpload} type="button">
          {busy ? 'Uploading...' : 'Upload photo'}
        </button>

        {lastUpload ? (
          <div className="record-card">
            <div className="record-card__title">
              <strong>Last uploaded photo</strong>
              <span>{new Date(lastUpload.createdAt).toLocaleString()}</span>
            </div>
            <p>{lastUpload.key}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
